import { navigate } from "gatsby";
import JSBI from "jsbi";
import React, { Fragment } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../../components/Buttons/Button";
import ConnectWalletButton from "../../components/Buttons/ConnectWalletButton";
import CurrencyInputPanel from "../../components/CurrencyInputPanel";
import ImportTokenWarningModal from "../../components/ImportTokenWarningModal";
import Section from "../../components/Layouts/Section";
import useModal from "../../components/Modal/useModal";
import CopyToClipboard from "../../components/widgets/CopyToClipboard";
import Skeleton from "../../components/widgets/Skeleton";
import SlippageTabs from "../../components/widgets/TransactionSettings/TransactionSettings";
import { CurrencyAmount } from "../../config/entities/fractions/currencyAmount";
import { Token } from "../../config/entities/token";
import { Trade } from "../../config/entities/trade";
import { useAllTokens, useCurrency } from "../../hooks/Tokens";
import { useIsTransactionUnsupported } from "../../hooks/Trades";
import useActiveWeb3React from "../../hooks/useActiveWeb3React";
import { ApprovalState, useApproveCallbackFromTrade } from "../../hooks/useApprovalCallback";
import { useSwapCallback } from "../../hooks/useSwapCallback";
import useWrapCallback, { WrapType } from "../../hooks/useWrapCallback";
import { Field } from "../../state/swap/actions";
import {
  useDefaultsFromURLSearch,
  useDerivedSwapInfo,
  useSwapActionHandlers,
  useSwapState,
} from "../../state/swap/hooks";
import { useUserId, useUserSlippageTolerance } from "../../state/user/hooks";
import { maxAmountSpend } from "../../utils/maxAmountSpend";
import { computeTradePriceBreakdown, warningSeverity } from "../../utils/prices";
import shouldShowSwapWarning from "../../utils/shouldShowSwapWarning";
import AdvancedSwapDetailsDropdown from "./components/AdvancedSwapDetailsDropdown";
import confirmPriceImpactWithoutFee from "./components/ConfirmPriceImpactWithoutFee";
import ConfirmSwapModal from "./components/ConfirmSwapModal";
import CurrencyInputHeader from "./components/CurrencyInputHeader";
import SwapWarningModal from "./components/SwapWarningModal";
import TradePrice from "./components/TradePrice";
import UnsupportedCurrencyFooter from "./components/UnsupportedCurrencyFooter";
import useRefreshBlockNumberID from "./hooks/useRefreshBlockNumber";
import { getSiteUrl } from "../../lib/hashAddress";
import { getBep20Contract, getKrlRefereeTrackerContract } from "../../utils/contractHelpers";
import BigNumber from "bignumber.js";
import CurrencyLogo from "../../components/Logo/CurrencyLogo";
import { BIG_TEN } from "../../utils/bigNumber";
import classNames from "classnames";

export default function Swap() {
  const loadedUrlParams = useDefaultsFromURLSearch();
  const { refreshBlockNumber, isLoading } = useRefreshBlockNumberID();
  // token warning stuff
  const [loadedInputCurrency, loadedOutputCurrency] = [
    useCurrency(loadedUrlParams?.inputCurrencyId),
    useCurrency(loadedUrlParams?.outputCurrencyId),
  ];
  const urlLoadedTokens: Token[] = useMemo(
    () => [loadedInputCurrency, loadedOutputCurrency]?.filter((c): c is Token => c instanceof Token) ?? [],
    [loadedInputCurrency, loadedOutputCurrency],
  );

  // dismiss warning if all imported tokens are in active lists
  const defaultTokens = useAllTokens();
  const importTokensNotInDefault =
    urlLoadedTokens &&
    urlLoadedTokens.filter((token: Token) => {
      return !(token.address in defaultTokens);
    });

  const { account, active, library } = useActiveWeb3React();

  // get custom setting values for user
  const [allowedSlippage] = useUserSlippageTolerance();

  // swap state & price data
  const {
    independentField,
    typedValue,
    [Field.INPUT]: { currencyId: inputCurrencyId },
    [Field.OUTPUT]: { currencyId: outputCurrencyId },
  } = useSwapState();
  const inputCurrency = useCurrency(inputCurrencyId);
  const outputCurrency = useCurrency(outputCurrencyId);
  const {
    v2Trade,
    currencyBalances,
    parsedAmount,
    currencies,
    inputError: swapInputError,
  } = useDerivedSwapInfo(independentField, typedValue, inputCurrency, outputCurrency);

  const {
    wrapType,
    execute: onWrap,
    inputError: wrapInputError,
  } = useWrapCallback(currencies[Field.INPUT], currencies[Field.OUTPUT], typedValue);
  const showWrap: boolean = wrapType !== WrapType.NOT_APPLICABLE;
  const trade = showWrap ? undefined : v2Trade;

  const parsedAmounts = showWrap
    ? {
        [Field.INPUT]: parsedAmount,
        [Field.OUTPUT]: parsedAmount,
      }
    : {
        [Field.INPUT]: independentField === Field.INPUT ? parsedAmount : trade?.inputAmount,
        [Field.OUTPUT]: independentField === Field.OUTPUT ? parsedAmount : trade?.outputAmount,
      };

  const { onSwitchTokens, onCurrencySelection, onUserInput } = useSwapActionHandlers();
  const isValid = !swapInputError;
  const dependentField: Field = independentField === Field.INPUT ? Field.OUTPUT : Field.INPUT;

  const handleTypeInput = useCallback(
    (value: string) => {
      onUserInput(Field.INPUT, value);
    },
    [onUserInput],
  );
  const handleTypeOutput = useCallback(
    (value: string) => {
      onUserInput(Field.OUTPUT, value);
    },
    [onUserInput],
  );

  // modal and loading
  const [{ tradeToConfirm, swapErrorMessage, attemptingTxn, txHash }, setSwapState] = useState<{
    tradeToConfirm: Trade | undefined;
    attemptingTxn: boolean;
    swapErrorMessage: string | undefined;
    txHash: string | undefined;
  }>({
    tradeToConfirm: undefined,
    attemptingTxn: false,
    swapErrorMessage: undefined,
    txHash: undefined,
  });

  const formattedAmounts = {
    [independentField]: typedValue,
    [dependentField]: showWrap
      ? parsedAmounts[independentField]?.toExact() ?? ""
      : parsedAmounts[dependentField]?.toSignificant(6) ?? "",
  };

  const route = trade?.route;
  const userHasSpecifiedInputOutput = Boolean(
    currencies[Field.INPUT] && currencies[Field.OUTPUT] && parsedAmounts[independentField]?.greaterThan(JSBI.BigInt(0)),
  );
  const noRoute = !route;

  // check whether the user has approved the router on the input token
  const [approval, approveCallback] = useApproveCallbackFromTrade(trade, allowedSlippage);

  // check if user has gone through approval process, used to show two step buttons, reset on token change
  const [approvalSubmitted, setApprovalSubmitted] = useState<boolean>(false);

  // mark when a user has submitted an approval, reset onTokenSelection for input field
  useEffect(() => {
    if (approval === ApprovalState.PENDING) {
      setApprovalSubmitted(true);
    }
  }, [approval, approvalSubmitted]);

  const maxAmountInput: CurrencyAmount | undefined = maxAmountSpend(currencyBalances[Field.INPUT]);
  const atMaxAmountInput = Boolean(maxAmountInput && parsedAmounts[Field.INPUT]?.equalTo(maxAmountInput));

  // the callback to execute the swap
  const { callback: swapCallback, error: swapCallbackError } = useSwapCallback(trade, allowedSlippage);

  const { priceImpactWithoutFee } = computeTradePriceBreakdown(trade);

  const handleSwap = useCallback(() => {
    if (priceImpactWithoutFee && !confirmPriceImpactWithoutFee(priceImpactWithoutFee)) {
      return;
    }
    if (!swapCallback) {
      return;
    }
    setSwapState({ attemptingTxn: true, tradeToConfirm, swapErrorMessage: undefined, txHash: undefined });
    swapCallback()
      .then((hash) => {
        setSwapState({ attemptingTxn: false, tradeToConfirm, swapErrorMessage: undefined, txHash: hash });
      })
      .catch((error) => {
        setSwapState({
          attemptingTxn: false,
          tradeToConfirm,
          swapErrorMessage: error.message,
          txHash: undefined,
        });
      });
  }, [priceImpactWithoutFee, swapCallback, tradeToConfirm]);

  // errors
  const [showInverted, setShowInverted] = useState<boolean>(false);

  // warnings on slippage
  const priceImpactSeverity = warningSeverity(priceImpactWithoutFee);

  // show approve flow when: no error on inputs, not approved or pending, or approved in current session
  // never show if price impact is above threshold in non expert mode
  const showApproveFlow =
    !swapInputError &&
    (approval === ApprovalState.NOT_APPROVED ||
      approval === ApprovalState.PENDING ||
      (approvalSubmitted && approval === ApprovalState.APPROVED)) &&
    !(priceImpactSeverity > 3);

  const handleConfirmDismiss = useCallback(() => {
    setSwapState({ tradeToConfirm, attemptingTxn, swapErrorMessage, txHash });
    // if there was a tx hash, we want to clear the input
    if (txHash) {
      onUserInput(Field.INPUT, "");
    }
  }, [attemptingTxn, onUserInput, swapErrorMessage, tradeToConfirm, txHash]);

  const handleAcceptChanges = useCallback(() => {
    setSwapState({ tradeToConfirm: trade, swapErrorMessage, txHash, attemptingTxn });
  }, [attemptingTxn, swapErrorMessage, trade, txHash]);

  // swap warning state
  const [swapWarningCurrency, setSwapWarningCurrency] = useState(null);
  const [onPresentSwapWarningModal] = useModal(<SwapWarningModal swapCurrency={swapWarningCurrency} />, false);

  useEffect(() => {
    if (swapWarningCurrency) {
      onPresentSwapWarningModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapWarningCurrency]);

  const handleInputSelect = useCallback(
    (currencyInput: any) => {
      setApprovalSubmitted(false); // reset 2 step UI for approvals
      onCurrencySelection(Field.INPUT, currencyInput);
      const showSwapWarning = shouldShowSwapWarning(currencyInput);
      if (showSwapWarning) {
        setSwapWarningCurrency(currencyInput);
      } else {
        setSwapWarningCurrency(null);
      }
    },
    [onCurrencySelection],
  );

  const handleMaxInput = useCallback(() => {
    if (maxAmountInput) {
      onUserInput(Field.INPUT, maxAmountInput.toExact());
    }
  }, [maxAmountInput, onUserInput]);

  const handleOutputSelect = useCallback(
    (currencyOutput: any) => {
      onCurrencySelection(Field.OUTPUT, currencyOutput);
      const showSwapWarning = shouldShowSwapWarning(currencyOutput);
      if (showSwapWarning) {
        setSwapWarningCurrency(currencyOutput);
      } else {
        setSwapWarningCurrency(null);
      }
    },

    [onCurrencySelection],
  );

  const swapIsUnsupported = useIsTransactionUnsupported(currencies?.INPUT, currencies?.OUTPUT);

  const [onPresentImportTokenWarningModal] = useModal(
    <ImportTokenWarningModal tokens={importTokensNotInDefault} onCancel={() => navigate("/swap")} />,
  );

  useEffect(() => {
    if (importTokensNotInDefault.length > 0) {
      onPresentImportTokenWarningModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importTokensNotInDefault.length]);

  const [onPresentConfirmModal] = useModal(
    <ConfirmSwapModal
      trade={trade}
      originalTrade={tradeToConfirm}
      onAcceptChanges={handleAcceptChanges}
      attemptingTxn={attemptingTxn}
      txHash={txHash}
      allowedSlippage={allowedSlippage}
      onConfirm={handleSwap}
      swapErrorMessage={swapErrorMessage}
      customOnDismiss={handleConfirmDismiss}
    />,
    true,
    true,
    "confirmSwapModal",
  );

  const hasAmount = Boolean(parsedAmount);

  const onRefreshPrice = useCallback(() => {
    if (hasAmount) {
      refreshBlockNumber();
    }
  }, [hasAmount, refreshBlockNumber]);

  const [userId] = useUserId();

  const [referralCount, setReferralCount] = useState(0);
  useEffect(() => {
    try {
      (async () => {
        if (account && library) {
          const contract = getKrlRefereeTrackerContract(library.getSigner(account));
          const { _hex } = await contract.referralCount(account);
          const count = new BigNumber(_hex).toNumber();
          setReferralCount(count);
        }
      })();
    } catch (error) {
      // console.log(error)
      setReferralCount(0);
    }
  }, [account, library]);

  const USDTCurrency = useCurrency("0x55d398326f99059fF775485246999027B3197955");
  const { v2Trade: tradeWithUSD } = useDerivedSwapInfo(Field.INPUT, "1", USDTCurrency, currencies[Field.OUTPUT]);
  const [totalSupply, setTotalSupply] = useState("0");
  const [marketCap, setMarketCap] = useState("-");

  useEffect(() => {
    const currency = currencies[Field.OUTPUT];
    // Just a hack to replace BNB with wbnb address
    const outCurrency = outputCurrencyId === "BNB" ? "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" : outputCurrencyId;

    (async () => {
      if (outCurrency && currency) {
        const contract = getBep20Contract(outCurrency);
        const { _hex: ts } = await contract.totalSupply();
        const totalSupply = new BigNumber(ts).div(BIG_TEN.pow(currency.decimals)).toNumber().toLocaleString();
        setTotalSupply(totalSupply);
      }
    })();
  }, [outputCurrencyId, currencies[Field.OUTPUT]]);

  useEffect(() => {
    const currency = currencies[Field.OUTPUT];
    const getMarketCap = async () => {
      if (tradeWithUSD && outputCurrencyId && currency) {
        const formattedPrice = showInverted
          ? tradeWithUSD.executionPrice.toSignificant(6)
          : tradeWithUSD.executionPrice.invert()?.toSignificant(6);

        // Just a hack to replace BNB with wbnb address
        const outCurrency =
          outputCurrencyId === "BNB" ? "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" : outputCurrencyId;

        fetch(
          `https://api.bscscan.com/api?module=stats&action=tokenCsupply&contractaddress=${outCurrency}&apikey=${process.env.GATSBY_BINANCE_API_KEY}`,
        ).then(async (res) => {
          const apiResponse = await res.json();
          const mc = new BigNumber(apiResponse.result)
            .div(BIG_TEN.pow(currency.decimals))
            .times(formattedPrice)
            .toNumber()
            .toLocaleString();

          setMarketCap(mc);
        });
      } else {
        setMarketCap("-");
      }
    };

    getMarketCap();
  }, [outputCurrencyId, currencies[Field.OUTPUT], tradeWithUSD?.executionPrice, showInverted]);

  const TokenInfoCard = useMemo(
    () =>
      ({ className }: { className?: string }) =>
        (
          <div className={classNames("p-3 shadow-md rounded-md border text-sm h-full bg-white", className)}>
            <div className="flex gap-3 items-center mb-5">
              {/* <img src="" alt="Kryptolite logo" className="w-10 h-10 bg-gray-500 overflow-hidden" /> */}
              <CurrencyLogo currency={currencies[Field.OUTPUT]} />
              <div>
                <h3 className="-mb-0.5 text-sm">{currencies[Field.OUTPUT]?.name} Token Info</h3>
                <p className="text-xs">{currencies[Field.OUTPUT]?.symbol}</p>
              </div>
            </div>
            <ul className="flex flex-col divide-y divide-gray-600">
              <li className="py-2">
                Market Cap: <b>{marketCap}</b>
              </li>
              <li className="py-2">
                Supply: <b>{totalSupply}</b>
              </li>
              <li className="py-2 flex gap-2">
                Price:{" "}
                {isLoading ? (
                  <Skeleton className="ml-2" />
                ) : (
                  <TradePrice
                    price={tradeWithUSD?.executionPrice}
                    showInverted={showInverted}
                    setShowInverted={setShowInverted}
                  />
                )}
              </li>
            </ul>
          </div>
        ),
    [
      currencies[Field.OUTPUT],
      showInverted,
      tradeWithUSD?.executionPrice,
      setShowInverted,
      marketCap,
      totalSupply,
      isLoading,
    ],
  );

  const [onPresentTransactionsModal] = useModal(<TokenInfoCard />);

  return (
    <Section padding>
      <div className="w-full justify-center relative">
        <div className="flex flex-col items-center md:flex-row gap-10 md:items-stretch md:justify-center">
          <div className="w-[328px] shrink-0  p-3 shadow-md rounded-md border">
            <CurrencyInputHeader
              title={"Swap"}
              subtitle={"Trade tokens in an instant"}
              hasAmount={hasAmount}
              onRefreshPrice={onRefreshPrice}
              onPresentTokenInfoModal={onPresentTransactionsModal}
            />
            <div id="swap-page" style={{ minHeight: "412px" }}>
              <div className="flex flex-col gap-4">
                <CurrencyInputPanel
                  label={independentField === Field.OUTPUT && !showWrap && trade ? "From (estimated)" : "From"}
                  value={formattedAmounts[Field.INPUT]}
                  showMaxButton={!atMaxAmountInput}
                  currency={currencies[Field.INPUT]}
                  onUserInput={handleTypeInput}
                  onMax={handleMaxInput}
                  onCurrencySelect={handleInputSelect}
                  otherCurrency={currencies[Field.OUTPUT]}
                  id="swap-currency-input"
                />
                <div className="flex flex-col justify-around">
                  <div className="flex justify-center" style={{ padding: "0 1rem" }}>
                    <Button
                      variant="outline"
                      className="shadow-sm text-xs py-1"
                      onClick={() => {
                        setApprovalSubmitted(false); // reset 2 step UI for approvals
                        onSwitchTokens();
                      }}
                    >
                      Switch
                    </Button>
                  </div>
                </div>
                <CurrencyInputPanel
                  value={formattedAmounts[Field.OUTPUT]}
                  onUserInput={handleTypeOutput}
                  label={independentField === Field.INPUT && !showWrap && trade ? "To (estimated)" : "To"}
                  showMaxButton={false}
                  currency={currencies[Field.OUTPUT]}
                  onCurrencySelect={handleOutputSelect}
                  otherCurrency={currencies[Field.INPUT]}
                  id="swap-currency-output"
                />
                <SlippageTabs />
                {showWrap ? null : (
                  <div className="flex flex-col gap-2" style={{ padding: "0 16px" }}>
                    <div className="flex gap-2 text-sm items-baseline">
                      {Boolean(trade) && (
                        <Fragment>
                          <p>Price</p>
                          {isLoading ? (
                            <Skeleton className="ml-2" />
                          ) : (
                            <TradePrice
                              price={trade?.executionPrice}
                              showInverted={showInverted}
                              setShowInverted={setShowInverted}
                            />
                          )}
                        </Fragment>
                      )}
                    </div>
                    {/* <p className="text-xs text-center text-blue-600">
                      Auto slippage is enabled your transaction will run at the best price possible
                    </p> */}
                  </div>
                )}
              </div>
              <div className="mt-1">
                {swapIsUnsupported ? (
                  <Button className="w-full" disabled>
                    {"Unsupported Asset"}
                  </Button>
                ) : !account ? (
                  <ConnectWalletButton className="w-full" />
                ) : showWrap ? (
                  <Button className="w-full" disabled={Boolean(wrapInputError)} onClick={onWrap}>
                    {wrapInputError ??
                      (wrapType === WrapType.WRAP ? "Wrap" : wrapType === WrapType.UNWRAP ? "Unwrap" : null)}
                  </Button>
                ) : noRoute && userHasSpecifiedInputOutput ? (
                  <div className="bg-gray-100" style={{ textAlign: "center", padding: "0.75rem" }}>
                    <p>Insufficient liquidity for this trade.</p>
                  </div>
                ) : showApproveFlow ? (
                  <div className="flex justify-between">
                    <Button
                      variant={approval === ApprovalState.APPROVED ? "primary" : "danger"}
                      onClick={approveCallback}
                      disabled={approval !== ApprovalState.NOT_APPROVED || approvalSubmitted}
                      className="w-[48%] text-sm"
                    >
                      {approval === ApprovalState.PENDING ? (
                        <div className="flex gap-1 justify-center">{"Enabling..."}</div>
                      ) : approvalSubmitted && approval === ApprovalState.APPROVED ? (
                        "Enabled"
                      ) : (
                        `Enable ${currencies[Field.INPUT]?.symbol ?? ""}`
                      )}
                    </Button>
                    <Button
                      variant={isValid && priceImpactSeverity > 2 ? "danger" : "primary"}
                      onClick={() => {
                        setSwapState({
                          tradeToConfirm: trade,
                          attemptingTxn: false,
                          swapErrorMessage: undefined,
                          txHash: undefined,
                        });
                        onPresentConfirmModal();
                      }}
                      className="w-[48%] text-sm"
                      id="swap-button"
                      disabled={!isValid || approval !== ApprovalState.APPROVED || priceImpactSeverity > 3}
                    >
                      {priceImpactSeverity > 3 ? "Price Impact High" : priceImpactSeverity > 2 ? "Swap Anyway" : "Swap"}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant={isValid && priceImpactSeverity > 2 && !swapCallbackError ? "danger" : "primary"}
                    onClick={() => {
                      setSwapState({
                        tradeToConfirm: trade,
                        attemptingTxn: false,
                        swapErrorMessage: undefined,
                        txHash: undefined,
                      });
                      onPresentConfirmModal();
                    }}
                    id="swap-button"
                    className="w-full text-sm"
                    disabled={!isValid || priceImpactSeverity > 3 || !!swapCallbackError}
                  >
                    {swapInputError ||
                      (priceImpactSeverity > 3
                        ? "Price Impact Too High"
                        : priceImpactSeverity > 2
                        ? "Swap Anyway"
                        : "Swap")}
                  </Button>
                )}
              </div>
            </div>
            {!swapIsUnsupported ? (
              trade && <AdvancedSwapDetailsDropdown trade={trade} />
            ) : (
              <UnsupportedCurrencyFooter currencies={[currencies.INPUT, currencies.OUTPUT]} />
            )}
          </div>
          <div className="w-full max-w-sm space-y-10 flex flex-col justify-between">
            <TokenInfoCard className="hidden md:block" />
            <div className="p-3 shadow-md rounded-md border text-sm h-full">
              <p>Refer a friend to trade on KryptoliteSwap and earn tokens from every trade they do.</p>
              <ol className="list-inside list-decimal my-3 text-gray-600">
                <li>Generate your referral link</li>
                <li>Invite your friends to trade</li>
                <li>Get 20% of all trade fees for life!</li>
              </ol>
              {
                <CopyToClipboard
                  canCopy={active}
                  content={active ? `${getSiteUrl()}/swap?ul=${userId}` : "Connect your wallet"}
                />
              }
              <p className="my-2">Share your referral link</p>
              <div className="border-t mt-5 pt-5">
                <h3>Total referrals:</h3>
                <p className="text-gray-500">
                  {referralCount === 0 ? "No referral yet" : referralCount + " Total referrals"}{" "}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
