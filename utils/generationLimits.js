const GUEST_GENERATION_LIMIT = 5;
const FREE_GENERATION_LIMIT = 15;

function isGuestUser(user, email) {
  const normalized = String(user?.email || email || "")
    .trim()
    .toLowerCase();
  return (
    user?.isGuest === true ||
    /^guest_[^@]+@bizideasai\.guest$/i.test(normalized)
  );
}

function generationLimitForUser(user, email) {
  if (user?.isPro === true) {
    return {
      isPro: true,
      accountType: "pro",
      limit: null,
      isUnlimited: true,
    };
  }

  if (isGuestUser(user, email)) {
    return {
      isPro: false,
      accountType: "guest",
      limit: GUEST_GENERATION_LIMIT,
      isUnlimited: false,
    };
  }

  return {
    isPro: false,
    accountType: "free",
    limit: FREE_GENERATION_LIMIT,
    isUnlimited: false,
  };
}

module.exports = {
  GUEST_GENERATION_LIMIT,
  FREE_GENERATION_LIMIT,
  isGuestUser,
  generationLimitForUser,
};
