/** Advance a frame deadline using the RAF timestamp, not the callback's CPU
 * start time. Small vsync quantization must not discard a full display frame. */
export function nextRenderClock(now,previous,limit) {
  if(!Number.isFinite(now))return null;
  if(!Number.isFinite(previous))return now;
  if(!(limit>0))return now;
  const interval=1000/limit,elapsed=now-previous,tolerance=Math.min(.75,interval*.05);
  if(elapsed<interval-tolerance)return null;
  return previous+Math.max(1,Math.floor((elapsed+tolerance)/interval))*interval;
}
