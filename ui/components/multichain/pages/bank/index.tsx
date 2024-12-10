import c from 'crypto';
import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Wallet } from 'ethers';
import copyToClipboard from 'copy-to-clipboard';
import browser from 'webextension-polyfill';
import {
  Box,
  Button,
  ButtonSize,
  ButtonVariant,
  Icon,
  IconName,
  IconSize,
  Text,
} from '../../../component-library';
import {
  AlignItems,
  BlockSize,
  Display,
  FlexDirection,
  IconColor,
  JustifyContent,
  TextColor,
  TextVariant,
} from '../../../../helpers/constants/design-system';
import { RampClient, Signature, EthPersonalSignature } from './ramp';
import {
  GetAccountInfoRequest,
  IbanCoordinates as IBAN,
  ScanCoordinates as SCAN,
} from './gen/ramp/v1/public_pb';

type IbanCoordinates = {
  iban: string;
};

type ScanCoordinates = {
  accountNumber: string;
  sortCode: string;
};

type BankCoordinates = IbanCoordinates | ScanCoordinates;

type BankDetails = {
  coordinates?: BankCoordinates;
  accountHolder?: string;
  reference?: string;
};

type Authentication = {
  authenticationUrl: string;
};

function isIban(coord?: BankCoordinates): boolean {
  return (coord as IbanCoordinates).iban !== undefined;
}

function accountNumber(coord?: BankCoordinates): string {
  if (!coord) {
    return '';
  }
  return isIban(coord)
    ? (coord as IbanCoordinates).iban
    : (coord as ScanCoordinates).accountNumber;
}

async function getHarbourWallet(): Promise<Wallet> {
  const pk = await browser.storage.local.get('harbourKey');
  if (pk.harbourKey) {
    console.log('harbour key found');
    return new Wallet(pk.harbourKey);
  }
  console.log('harbour key not found, generating new', pk);
  const key = `0x${c.randomBytes(32).toString('hex')}`;
  await browser.storage.local.set({ harbourKey: key });
  return new Wallet(key);
}

const signPayload = (wallet: Wallet, payload: string): Promise<string> => {
  const sig = wallet.signMessage(payload);
  console.log('Signature:', sig);
  return sig;
};

const BankPage: React.FC = () => {
  const history = useHistory();
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [authentication, setAuthentication] = useState<Authentication | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBankDetails = async () => {
      try {
        const ramp = new RampClient(
          'https://api.harborapp.link',
          async (payload): Promise<Signature> => {
            const wallet = await getHarbourWallet();
            const sig = await signPayload(wallet, payload);
            return Promise.resolve({
              signature: sig,
              publicKey: wallet.publicKey,
              ...EthPersonalSignature,
            });
          },
        );
        const accountInfo = await ramp.getAccountInfo(
          new GetAccountInfoRequest(),
        );
        setBankDetails({});
        console.log(accountInfo);
        if (accountInfo.result.case === 'authentication') {
          setAuthentication({
            authenticationUrl: accountInfo.result.value.authenticationUrl,
          });
        } else {
          const apiCoordinates =
            accountInfo.result.value?.onrampBankAccount.value;
          const accountHolder = accountInfo.result.value?.accountHolder ?? '';
          const reference = 'PUSDC1';
          if (apiCoordinates instanceof IBAN) {
            setBankDetails({
              coordinates: {
                iban: (apiCoordinates as IbanCoordinates).iban,
              },
              reference,
              accountHolder,
            });
          } else if (apiCoordinates instanceof SCAN) {
            setBankDetails({
              coordinates: {
                accountNumber: (apiCoordinates as ScanCoordinates)
                  .accountNumber,
                sortCode: (apiCoordinates as ScanCoordinates).sortCode,
              },
              reference,
              accountHolder,
            });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchBankDetails();
  }, []);

  if (isLoading) {
    return <Text>Loading...</Text>;
  }
  if (error) {
    return <Text color={TextColor.errorDefault}>{error}</Text>;
  }
  if (!bankDetails) {
    return null;
  }

  const handleCopy = (text?: string): void => {
    if (!text) {
      return;
    }
    copyToClipboard(text);
  };

  return (
    <Box
      className="iban-details"
      paddingBottom={4}
      paddingLeft={3}
      paddingRight={3}
      paddingTop={4}
    >
      {authentication && (
        <Box paddingBottom={8}>
          <Box
            alignItems={AlignItems.center}
            display={Display.Flex}
            justifyContent={JustifyContent.center}
            marginBottom={8}
            width={BlockSize.Full}
          >
            <img src="images/logo/metamask-fox-big.svg" alt="MetaMask Logo" />
            <Box display={Display.Flex} flexDirection={FlexDirection.Column}>
              <Icon
                color={IconColor.iconDefault}
                marginInlineStart={4}
                marginInlineEnd={4}
                name={IconName.Arrow2Right}
                size={IconSize.Sm}
              />
              <Icon
                color={IconColor.iconDefault}
                marginInlineEnd={4}
                marginInlineStart={4}
                name={IconName.Arrow2Left}
                size={IconSize.Sm}
              />
            </Box>
            <img src="images/logo/harbour.svg" alt="Harbour Logo" />
          </Box>
          <Text
            variant={TextVariant.headingMd}
            marginBottom={8}
            style={{
              fontFamily: 'Space Grotesk',
              fontStyle: 'normal',
              fontWeight: 'normal',
              fontSize: '22px',
              textAlign: 'center',
            }}
          >
            Get your free MetaMask IBAN
          </Text>
          <Text
            variant={TextVariant.bodyMd}
            marginTop={1}
            marginBottom={5}
            style={{ fontFamily: 'Space Grotesk', fontStyle: 'normal' }}
          >
            We’ve partnered with Harbour to give you a free EUR IBAN linked to
            your MetaMask Wallet.
          </Text>
          <Text
            variant={TextVariant.bodyMd}
            marginBottom={5}
            style={{ fontFamily: 'Space Grotesk', fontStyle: 'normal' }}
          >
            This lets you make instant payments between your bank account and
            your MetaMask Wallet.
          </Text>
          <Text
            variant={TextVariant.bodyMd}
            marginBottom={5}
            style={{ fontFamily: 'Space Grotesk', fontStyle: 'normal' }}
          >
            To generate your IBAN you’ll just need to verify your identity
            first.
          </Text>
          <Text
            variant={TextVariant.bodyMd}
            style={{ fontFamily: 'Space Grotesk', fontStyle: 'normal' }}
          >
            What you’ll need:
          </Text>
          <ul style={{ listStyle: 'disc', marginLeft: 25 }}>
            <li>
              <Text
                variant={TextVariant.bodyMd}
                style={{ fontFamily: 'Space Grotesk', fontStyle: 'normal' }}
              >
                Residency in an EU country
              </Text>
            </li>
            <li>
              <Text
                variant={TextVariant.bodyMd}
                style={{ fontFamily: 'Space Grotesk', fontStyle: 'normal' }}
              >
                A mobile phone number from such country
              </Text>
            </li>
            <li>
              <Text
                variant={TextVariant.bodyMd}
                style={{ fontFamily: 'Space Grotesk', fontStyle: 'normal' }}
              >
                A valid identity document, such as a driving license, passport
                or national ID card.
              </Text>
            </li>
          </ul>
          <Text
            variant={TextVariant.bodyMd}
            marginBottom={8}
            marginTop={5}
            style={{ fontFamily: 'Space Grotesk', fontStyle: 'normal' }}
          >
            The process only takes a couple of minutes.
          </Text>
          <Box
            alignItems={AlignItems.flexStart}
            display={Display.Flex}
            gap={4}
            marginTop={1}
          >
            <Button
              danger
              onClick={() => history.goBack()}
              size={ButtonSize.Md}
              variant={ButtonVariant.Primary}
              width={BlockSize.FourTwelfths}
              style={{ fontFamily: 'Space Grotesk', fontStyle: 'normal' }}
            >
              Back
            </Button>
            <Button
              externalLink
              href={authentication.authenticationUrl}
              size={ButtonSize.Md}
              target="_blank"
              variant={ButtonVariant.Primary}
              width={BlockSize.EightTwelfths}
              style={{ fontFamily: 'Space Grotesk', fontStyle: 'normal' }}
            >
              Next
            </Button>
          </Box>
        </Box>
      )}
      {bankDetails.coordinates && (
        <Box>
          <Text variant={TextVariant.headingLg} marginBottom={4}>
            Account Details
          </Text>
          <Text
            marginTop={4}
            variant={TextVariant.headingMd}
            color={TextColor.textDefault}
          >
            {isIban(bankDetails.coordinates) ? 'IBAN' : 'Account Number'}
          </Text>
          <Box display={Display.Flex} alignItems={AlignItems.center} gap={2}>
            <Text variant={TextVariant.bodyMd}>
              {accountNumber(bankDetails?.coordinates)}
            </Text>
            <Button
              onClick={() =>
                handleCopy(accountNumber(bankDetails?.coordinates))
              }
              size={ButtonSize.Sm}
              variant={ButtonVariant.Secondary}
            >
              Copy
            </Button>
          </Box>
          {!isIban(bankDetails.coordinates) && (
            <Box>
              <Text
                marginTop={4}
                variant={TextVariant.headingMd}
                color={TextColor.textDefault}
              >
                Sort Code
              </Text>
              <Box
                display={Display.Flex}
                alignItems={AlignItems.center}
                gap={2}
              >
                <Text variant={TextVariant.bodyMd}>
                  {(bankDetails.coordinates as ScanCoordinates).sortCode}
                </Text>
                <Button
                  onClick={() =>
                    handleCopy(
                      (bankDetails.coordinates as ScanCoordinates).sortCode,
                    )
                  }
                  size={ButtonSize.Sm}
                  variant={ButtonVariant.Secondary}
                >
                  Copy
                </Button>
              </Box>
            </Box>
          )}
          <Text
            marginTop={4}
            variant={TextVariant.headingMd}
            color={TextColor.textDefault}
          >
            Account Holder
          </Text>
          <Box display={Display.Flex} alignItems={AlignItems.center} gap={2}>
            <Text variant={TextVariant.bodyMd}>
              {bankDetails.accountHolder}
            </Text>
            <Button
              onClick={() => handleCopy(bankDetails.accountHolder)}
              size={ButtonSize.Sm}
              variant={ButtonVariant.Secondary}
            >
              Copy
            </Button>
          </Box>
          <Text
            marginTop={4}
            variant={TextVariant.headingMd}
            color={TextColor.textDefault}
          >
            Payment Reference
          </Text>
          <Box display={Display.Flex} alignItems={AlignItems.center} gap={2}>
            <Text variant={TextVariant.bodyMd}>{bankDetails.reference}</Text>
            <Button
              onClick={() => handleCopy(bankDetails.reference)}
              size={ButtonSize.Sm}
              variant={ButtonVariant.Secondary}
            >
              Copy
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default BankPage;
