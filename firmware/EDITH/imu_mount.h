#pragma once
#include <math.h>

// Sensor coordinates -> main-board coordinates. An upside-down mount is a
// proper 180-degree rotation about X: negate BOTH Y and Z, for accel AND gyro.
// The optional in-plane yaw then aligns the module's printed axes to the board.
inline void alignImuVector(float &x, float &y, float &z, bool upsideDown, float yawDegrees) {
  if (upsideDown) { y = -y; z = -z; }
  const float angle = yawDegrees * 0.017453292519943295f;
  const float c = cosf(angle), s = sinf(angle), oldX = x;
  x = c * oldX - s * y;
  y = s * oldX + c * y;
}
