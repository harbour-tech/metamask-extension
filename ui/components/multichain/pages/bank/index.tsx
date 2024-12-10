import c from 'crypto';
import React, { useEffect, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Wallet } from 'ethers';
import copyToClipboard from 'copy-to-clipboard';
import browser from 'webextension-polyfill';
import {
  Box,
  Button,
  ButtonSize,
  ButtonVariant,
  Text,
} from '../../../component-library';
import {
  AlignItems,
  Display,
  TextColor,
  TextVariant,
} from '../../../../helpers/constants/design-system';
import { useTheme } from '../../../../hooks/useTheme';

import { RampClient, Signature, EthPersonalSignature } from './ramp';
import {
  EstimateOnRampFeeRequest,
  GetAccountInfoRequest,
  IbanCoordinates as IBAN,
  Protocol,
  AssetId,
  ScanCoordinates as SCAN,
  CurrencyId,
  EstimateOnRampFeeResponse,
} from './gen/ramp/v1/public_pb';
import { useDebounce } from './useDebounce';

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
  return sig;
};

const BankPage: React.FC = () => {
  const history = useHistory();
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [authentication, setAuthentication] = useState<Authentication | null>(
    null,
  );
  const theme = useTheme();
  const isDarkTheme = theme === 'dark';
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(250);
  const debouncedAmount = useDebounce(amount, 400);
  const [feeLoading, setFeeLoading] = useState(false);
  const [currency, setCurrency] = useState<CurrencyId>(CurrencyId.EUR);
  const inputRef = React.createRef<HTMLInputElement>();

  const [amountInputFocused, setAmountInputFocused] = useState(false);
  const [feeResults, setFeeResults] =
    useState<EstimateOnRampFeeResponse | null>(null);

  const ramp = useMemo(() => {
    return new RampClient(
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
  }, []);

  useEffect(() => {
    const fetchBankDetails = async () => {
      try {
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
            setCurrency(CurrencyId.EUR);
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
            setCurrency(CurrencyId.GBP);
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

  useEffect(() => {
    try {
      if (debouncedAmount && currency) {
        setFeeLoading(true);
        const request = new EstimateOnRampFeeRequest({
          cryptoAssetId: AssetId.ASSET_ID_USDC,
          protocol: Protocol.POLYGON,
          amount: {
            value: debouncedAmount.toString(),
            case: 'fiatAssetAmount',
          },
          fiatAssetId: currency,
        });
        ramp.estimateOnRampFee(request).then((res) => {
          setFeeResults(res);
          setFeeLoading(false);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setFeeLoading(false);
      setFeeResults(null);
    }
  }, [debouncedAmount, currency]);

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

  const borderFocus = '#2b7bcc';
  const borderNormal = isDarkTheme ? 'white' : '#c4ccd4';

  return (
    <Box className="iban-details" padding={2}>
      <Button
        onClick={() => history.goBack()}
        size={ButtonSize.Sm}
        variant={ButtonVariant.Secondary}
      >
        Back
      </Button>
      {authentication && (
        <Box>
          <Text variant={TextVariant.headingLg} marginBottom={4}>
            Connect Harbour Account
          </Text>
          <Text variant={TextVariant.bodySm} marginBottom={4}>
            <a
              href={authentication.authenticationUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Harbour.fi
            </a>
          </Text>
        </Box>
      )}
      {bankDetails.coordinates && (
        <>
          <Box>
            <div
              style={{
                width: '99%',
                minHeight: '40px',
                padding: '10px',
                borderWidth: '2px',
                borderStyle: 'solid',
                borderColor: amountInputFocused ? borderFocus : borderNormal,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'start',
                cursor: 'pointer',
                borderRadius: '6px',
              }}
              onClick={() => {
                inputRef.current?.focus?.();
              }}
            >
              <Text variant={TextVariant.bodyMd} style={{ fontSize: '14px' }}>
                Send
              </Text>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '10px',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <img
                  src={
                    currency === CurrencyId.GBP
                      ? '/images/gbp.svg'
                      : '/images/euro.svg'
                  }
                  style={{
                    width: '47px',
                    height: '30px',
                    objectFit: 'cover',
                    overflow: 'hidden',
                    borderRadius: '10px',
                  }}
                />
                <input
                  ref={inputRef}
                  type="number"
                  placeholder="Enter amount"
                  onFocus={() => setAmountInputFocused(true)}
                  onBlur={() => setAmountInputFocused(false)}
                  value={amount || undefined}
                  onChange={(e) => setAmount(parseInt(e.target.value, 10))}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    width: '100%',
                    fontSize: '35px',
                    color: isDarkTheme ? 'white' : 'black',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                width: '99%',
                minHeight: '40px',
                padding: '10px',
                borderStyle: 'solid',
                borderWidth: '2px',
                borderColor: borderNormal,
                display: 'flex',
                flexDirection: 'column',
                marginTop: '10px',
                borderRadius: '6px',
                marginBottom: '10px',
                opacity: 0.7,
              }}
            >
              <Text variant={TextVariant.bodyMd} style={{ fontSize: '14px' }}>
                Receive
              </Text>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '10px',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <img
                  src="/images/usdc.svg"
                  style={{
                    width: '47px',
                    height: '45px',
                    objectFit: 'contain',
                    objectPosition: 'right',
                  }}
                />
                {feeLoading ? (
                  <span
                    style={{
                      fontSize: '35px',
                      color: isDarkTheme ? 'white' : 'black',
                      flex: 1,
                      opacity: 0.5,
                    }}
                  >
                    Loading...
                  </span>
                ) : (
                  <input
                    type="number"
                    placeholder="You will get"
                    value={
                      debouncedAmount && debouncedAmount > 0
                        ? feeResults?.cryptoAssetAmount || undefined
                        : undefined
                    }
                    disabled
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      width: '100%',
                      fontSize: '35px',
                      color: isDarkTheme ? 'white' : 'black',
                    }}
                  />
                )}
              </div>
            </div>
            {feeResults?.exchangeRate && (
              <span>
                USDC/{currency === CurrencyId.EUR ? 'EUR' : 'GBP'} rate:{' '}
                {feeResults?.exchangeRate}
              </span>
            )}
          </Box>
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
        </>
      )}
    </Box>
  );
};

export default BankPage;
