export const auth = (req, res, next) => {
  req.user = null;
  next();
};
