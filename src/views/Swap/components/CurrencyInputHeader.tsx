import React from "react";
import { BiInfoCircle } from "react-icons/bi";
import RefreshIcon from "../../../components/Svg/Icons/Refresh";

interface Props {
  title: string;
  subtitle: string;
  noConfig?: boolean;
  isChartDisplayed?: boolean;
  hasAmount: boolean;
  onRefreshPrice: () => void;
  onPresentTokenInfoModal: () => void;
}

const CurrencyInputHeader: React.FC<Props> = ({
  title,
  subtitle,
  hasAmount,
  onRefreshPrice,
  onPresentTokenInfoModal,
}) => {
  return (
    <div className="flex flex-col items-center p-6 mb-3 w-full border-b">
      <div className="flex w-full items-center justify-between mb-2">
        <div className="flex flex-col items-start w-full mr-4">
          <h2 className="text-2xl my-0">{title}</h2>
        </div>
        <div className="flex items-center gap-1">
          <button className="cursor-pointer" onClick={onPresentTokenInfoModal}>
            <BiInfoCircle color="#49AE01" size={27} />
          </button>
          <button className="cursor-pointer" onClick={() => onRefreshPrice()} disabled={!hasAmount}>
            <RefreshIcon color="textSubtle" width="27px" />
          </button>
        </div>
      </div>
      <div className="flex items-center text-sm">
        <p>{subtitle}</p>
      </div>
    </div>
  );
};

export default CurrencyInputHeader;
