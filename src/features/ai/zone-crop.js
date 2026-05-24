export const AI_ZONE_EDGE_GUARD = 0.06;

export const videoCoverSourceRect = ({ frameWidth, frameHeight, displayWidth, displayHeight }) => {
  const sourceFrameWidth = frameWidth || 640;
  const sourceFrameHeight = frameHeight || 480;
  const targetDisplayWidth = displayWidth || sourceFrameWidth;
  const targetDisplayHeight = displayHeight || sourceFrameHeight;
  const frameRatio = sourceFrameWidth / sourceFrameHeight;
  const displayRatio = targetDisplayWidth / targetDisplayHeight;

  if (displayRatio > frameRatio) {
    const sourceHeight = sourceFrameWidth / displayRatio;
    return {
      x: 0,
      y: Math.max(0, (sourceFrameHeight - sourceHeight) / 2),
      width: sourceFrameWidth,
      height: sourceHeight,
    };
  }

  const sourceWidth = sourceFrameHeight * displayRatio;
  return {
    x: Math.max(0, (sourceFrameWidth - sourceWidth) / 2),
    y: 0,
    width: sourceWidth,
    height: sourceFrameHeight,
  };
};

export const selectedZoneSourceRectFromRects = ({
  frameWidth,
  frameHeight,
  videoRect,
  zoneRect,
  edgeGuard = AI_ZONE_EDGE_GUARD,
}) => {
  if (!videoRect?.width || !videoRect?.height || !zoneRect?.width || !zoneRect?.height) return null;

  const visibleSource = videoCoverSourceRect({
    frameWidth,
    frameHeight,
    displayWidth: videoRect.width,
    displayHeight: videoRect.height,
  });
  const left = Math.max(zoneRect.left, videoRect.left);
  const top = Math.max(zoneRect.top, videoRect.top);
  const right = Math.min(zoneRect.left + zoneRect.width, videoRect.left + videoRect.width);
  const bottom = Math.min(zoneRect.top + zoneRect.height, videoRect.top + videoRect.height);
  if (right <= left || bottom <= top) return null;

  const scaleX = visibleSource.width / videoRect.width;
  const scaleY = visibleSource.height / videoRect.height;
  const guardX = (right - left) * edgeGuard;
  const guardY = (bottom - top) * edgeGuard;

  return {
    x: visibleSource.x + ((left - videoRect.left + guardX) * scaleX),
    y: visibleSource.y + ((top - videoRect.top + guardY) * scaleY),
    width: Math.max(1, (right - left - (guardX * 2)) * scaleX),
    height: Math.max(1, (bottom - top - (guardY * 2)) * scaleY),
  };
};

export const pointInRect = (point, rect) =>
  Boolean(rect)
  && point.x >= rect.x
  && point.x <= rect.x + rect.width
  && point.y >= rect.y
  && point.y <= rect.y + rect.height;
