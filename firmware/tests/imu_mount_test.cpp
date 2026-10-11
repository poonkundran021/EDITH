#include "../EDITH/imu_mount.h"
#include <cassert>
#include <cstdio>

bool near(float a,float b){return fabsf(a-b)<0.00001f;}
int main(){
 // A flat upright main board presents -Z gravity to an inverted sensor.
 float x=0,y=0,z=-1;
 alignImuVector(x,y,z,true,0);
 assert(near(x,0)&&near(y,0)&&near(z,1));
 assert(near(atan2f(y,z),0));
 // Physical +30 degree roll: corrected gravity must seed +30, not -150.
 x=0;y=-0.5f;z=-sqrtf(0.75f);
 alignImuVector(x,y,z,true,0);
 assert(near(atan2f(y,z),0.5235987756f));
 // Physical +30 degree pitch and a positive pitch angular velocity agree.
 x=-0.5f;y=0;z=-sqrtf(0.75f);
 alignImuVector(x,y,z,true,0);
 assert(near(atan2f(-x,sqrtf(y*y+z*z)),0.5235987756f));
 x=0;y=-1;z=0;alignImuVector(x,y,z,true,0);
 assert(near(y,1));
 // Rotation preserves magnitude and handedness for all three axes.
 float ex=1,ey=0,ez=0,fx=0,fy=1,fz=0,gx=0,gy=0,gz=1;
 alignImuVector(ex,ey,ez,true,90);alignImuVector(fx,fy,fz,true,90);alignImuVector(gx,gy,gz,true,90);
 assert(near(ex*ex+ey*ey+ez*ez,1));
 assert(near(ey*fz-ez*fy,gx)&&near(ez*fx-ex*fz,gy)&&near(ex*fy-ey*fx,gz));
 x=0.2f;y=-0.3f;z=0.4f;alignImuVector(x,y,z,false,0);
 assert(near(x,0.2f)&&near(y,-0.3f)&&near(z,0.4f));
 puts("IMU mounting tests passed: flat, roll, pitch, gyro and handedness.");
}
