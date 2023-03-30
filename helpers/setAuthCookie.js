const CacheDuration = {
  ONE_HOUR: 60 * 60,
};

const setAuthCookie = (res, token) => {
  res.cookie('token', token, {
    maxAge: CacheDuration.ONE_HOUR,
    httpOnly: true,
    sameSite: 'none',
  });
}

module.exports = setAuthCookie;
