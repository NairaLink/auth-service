const clearAuthCookie = (res) => {
  res.cookie('token', 'loggedout', {
    maxAge: 10,
  });
}

module.exports = clearAuthCookie;
