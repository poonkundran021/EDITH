"""Local integration checks only. Never writes fabricated telemetry to production."""
import json,time,urllib.request,urllib.error
URL='http://127.0.0.1:5173/api/telemetry'
sample=dict(device='edith-01',boot='local-test',seq=100,capturedAt=int(time.time()*1000),location='LOCAL TEST - synthetic',temperature=28,humidity=62,pressure=1012,gas=430,smoke='clear',quaternion=[1,0,0,0],health=dict(bmp=True,dht=True,mpu=True,mq='monitoring',calibrated=True),uptime=123,rssi=-50)
def request(data=None,token='local-test-token',raw=None):
    headers={'Content-Type':'application/json','Authorization':'Bearer '+token}
    req=urllib.request.Request(URL,data=raw if raw is not None else json.dumps(data).encode() if data else None,headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=15) as r:return r.status,json.load(r)
    except urllib.error.HTTPError as e:return e.code,json.load(e)
assert request(sample,token='wrong')[0]==401
assert request(raw=b'{' )[0]==400
assert request(raw=b'x'*5000)[0]==413
assert request(dict(sample,humidity=101))[0]==422
assert request(dict(sample,capturedAt=int(time.time()*1000)-20000))[0]==422
status,body=request(sample);assert status==200 and body['accepted'],(status,body)
assert request(sample)[1]['accepted'] is False
status,body=request();assert status==200 and body['online'] and body['data']['temperature']==28
print('8 API checks passed: auth, malformed JSON, size limit, ranges, expiry, valid write/read, replay.')
