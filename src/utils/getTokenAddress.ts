// ETH Address
const ETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

export { ETH_ADDRESS };

export const getTokenAddress = (tokenAddress: undefined | string) => {
  if (!tokenAddress) {
    return "";
  }
  const lowerCaseAddress = tokenAddress.toLowerCase();
  if (lowerCaseAddress === "eth") {
    return ETH_ADDRESS;
  }

  return lowerCaseAddress;
};
