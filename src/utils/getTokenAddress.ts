// ETH Address
const ETH_ADDRESS = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";

export { ETH_ADDRESS };

export const getTokenAddress = (tokenAddress: undefined | string) => {
  if (!tokenAddress) {
    return "";
  }
  const lowerCaseAddress = tokenAddress.toLowerCase();
  if (lowerCaseAddress === "bnb") {
    return ETH_ADDRESS;
  }

  return lowerCaseAddress;
};
