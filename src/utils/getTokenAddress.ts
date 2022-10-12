// BNB Address
const BNB_ADDRESS = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";

export { BNB_ADDRESS };

export const getTokenAddress = (tokenAddress: undefined | string) => {
  if (!tokenAddress) {
    return "";
  }
  const lowerCaseAddress = tokenAddress.toLowerCase();
  if (lowerCaseAddress === "bnb") {
    return BNB_ADDRESS;
  }

  return lowerCaseAddress;
};
