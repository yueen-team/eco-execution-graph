const offsetSeconds = Number(
  process.env.CLOUDBASE_TIME_OFFSET_SECONDS ||
    process.env.TENCENT_CLOUD_TIME_OFFSET_SECONDS ||
    0,
);

if (Number.isFinite(offsetSeconds) && offsetSeconds !== 0) {
  const offsetMs = Math.trunc(offsetSeconds * 1000);
  const RealDate = Date;

  function ShiftedDate(...args) {
    if (this instanceof ShiftedDate) {
      if (args.length === 0) {
        return new RealDate(RealDate.now() + offsetMs);
      }
      return new RealDate(...args);
    }
    return new RealDate(RealDate.now() + offsetMs).toString();
  }

  Object.setPrototypeOf(ShiftedDate, RealDate);
  ShiftedDate.prototype = RealDate.prototype;
  ShiftedDate.now = () => RealDate.now() + offsetMs;
  ShiftedDate.parse = RealDate.parse.bind(RealDate);
  ShiftedDate.UTC = RealDate.UTC.bind(RealDate);

  global.Date = ShiftedDate;
}
