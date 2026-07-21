"""HOW FAR CAN WE GO WITHOUT A MANDAL'S OWN SENSOR?

Leave-whole-mandal-out CV (the mandal never sees its own readings) — the honest
'sensor-independence' metric. We stack every OPEN signal we have and measure which
actually help estimate a no-sensor mandal's level in metres:

  A location only (lat/lon)
  B + real CGWB specific yield + aquifer + terrain (static physics)
  C + rainfall (NASA POWER) + GRACE district percentiles (satellite)
  D + IDW neighbour level (spatial interpolation from OTHER mandals' sensors)
  E full stack

This is exactly the regime InSAR would boost (it adds a physical change signal at
every mandal). Everything here is open / no-Earthdata.
"""
import csv, json, os, re, math
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")

HARD_ROCK = {"ANANTHAPURAMU","ANANTAPUR","SRI SATHYA SAI","Y.S.R KADAPA","Y.S.R.","KADAPA","KURNOOL","NANDYAL","CHITTOOR","ANNAMAYYA","TIRUPATI"}
DELTA = {"KRISHNA","EAST GODAVARI","WEST GODAVARI","GUNTUR","KONASEEMA","ELURU","NTR","BAPATLA","PALNADU"}
def aquifer_of(d):
    du=d.upper()
    if du in HARD_ROCK: return "hard_rock",0.020
    if du in DELTA: return "alluvial",0.110
    return "coastal",0.080
def norm(s):
    s=str(s).upper().strip();s=re.sub(r"\(.*?\)"," ",s)
    s=re.sub(r"\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN)\b"," ",s)
    s=s.replace("."," ").replace("-"," ").replace("&"," AND ");return re.sub(r"\s+"," ",re.sub(r"[^A-Z0-9 ]"," ",s)).strip()
def hav(la1,lo1,la2,lo2):
    R=6371.0;p1,p2=np.radians(la1),np.radians(la2);dla=np.radians(la2-la1);dlo=np.radians(lo2-lo1)
    a=np.sin(dla/2)**2+np.cos(p1)*np.cos(p2)*np.sin(dlo/2)**2;return 2*R*np.arcsin(np.sqrt(a))
def metrics(y,p): return math.sqrt(mean_squared_error(y,p)),mean_absolute_error(y,p),r2_score(y,p)

def idw_predict(train,test,k=8,power=2.0):
    out=np.full(len(test),np.nan)
    tb={m:g for m,g in train.groupby("date")}
    test=test.reset_index(drop=True)
    for i,r in test.iterrows():
        g=tb.get(r["date"])
        if g is None or len(g)==0: continue
        d=hav(r["lat"],r["lon"],g["lat"].values,g["lon"].values)
        o=np.argsort(d)[:k]; dd,vv=d[o],g["level_mbgl"].values[o]
        w=1.0/(dd**power+1e-6); out[i]=np.sum(w*vv)/np.sum(w)
    out[np.isnan(out)]=train["level_mbgl"].mean(); return out

def main():
    df=pd.read_csv(os.path.join(HERE,"apwrims","apwrims_gw_history.csv"))
    df=df[(df.level_mbgl>0)&(df.level_mbgl<60)].copy(); df["mkey"]=df.mandal.map(norm)
    aq=df.district.map(aquifer_of); df["aquifer_type"]=aq.map(lambda x:x[0]); df["sy_proxy"]=aq.map(lambda x:x[1])
    # real Sy
    syp=os.path.join(HERE,"data","mandal_specific_yield.csv")
    sy={r["mkey"]:float(r["specific_yield_real"]) for _,r in pd.read_csv(syp).iterrows()} if os.path.exists(syp) else {}
    df["specific_yield"]=df.mkey.map(sy).fillna(df.sy_proxy)
    # centroids + GRACE district pctl + terrain
    geo=json.load(open(os.path.join(APP,"ap_map_geometry.json"))); cents={}
    for m in geo["mandals"]:
        pts=[pt for ring in m["rings"] for pt in ring]
        if pts: cents[norm(m["m"])]=(sum(p[1] for p in pts)/len(pts),sum(p[0] for p in pts)/len(pts))
    dgeo={d["d"].upper():d for d in json.load(open(os.path.join(APP,"ap_district_geometry.json")))["districts"]}
    terr={}
    tp=os.path.join(HERE,"data","mandal_terrain.csv")
    if os.path.exists(tp):
        for _,r in pd.read_csv(tp).iterrows(): terr[norm(str(r["mandal_id"]).split("|")[-1])]=float(r["elevation_m"])
    df["lat"]=df.mkey.map(lambda k:cents.get(k,(np.nan,np.nan))[0]); df["lon"]=df.mkey.map(lambda k:cents.get(k,(np.nan,np.nan))[1])
    df["elevation"]=df.mkey.map(lambda k:terr.get(k,300.0))
    df["grace_gw"]=df.district.map(lambda d:(dgeo.get(d.upper()) or {}).get("gw_percentile") or 90.0)
    df["grace_root"]=df.district.map(lambda d:(dgeo.get(d.upper()) or {}).get("rootzone_percentile") or 85.0)
    rain=pd.read_csv(os.path.join(HERE,"data","mandal_rain_history.csv")); rain["mkey"]=rain.mandal.map(norm)
    rain=rain.groupby(["mkey","date"],as_index=False).rain_mm.mean()
    df=df.merge(rain,on=["mkey","date"],how="left").sort_values(["mkey","date"]).reset_index(drop=True)
    df["rain_12m"]=df.groupby("mkey").rain_mm.apply(lambda x:x.fillna(0).rolling(12,min_periods=1).sum()).reset_index(level=0,drop=True)
    mo=df.date.str.slice(5,7).astype(int); df["month_sin"]=np.sin(2*np.pi*(mo-1)/12); df["month_cos"]=np.cos(2*np.pi*(mo-1)/12)
    df=df.dropna(subset=["lat","lon"]).reset_index(drop=True)
    y=df.level_mbgl.values; groups=df.mkey.values
    gkf=GroupKFold(5)
    def cv(num,cat,use_idw=False):
        preds=np.zeros(len(y))
        for tr,te in gkf.split(df,y,groups):
            trd,ted=df.iloc[tr],df.iloc[te]
            X=trd[num+cat].copy(); Xt=ted[num+cat].copy()
            if use_idw:
                X=X.assign(idw=idw_predict(trd,trd)); Xt=Xt.assign(idw=idw_predict(trd,ted))
            pre=ColumnTransformer([("n","passthrough",num+(["idw"] if use_idw else [])),("c",OneHotEncoder(handle_unknown="ignore"),cat)])
            m=Pipeline([("p",pre),("r",HistGradientBoostingRegressor(max_iter=500,learning_rate=0.05,max_depth=7,random_state=0))])
            m.fit(X,y[tr]); preds[te]=m.predict(Xt)
        return metrics(y,preds)
    print(f"  rows {len(df):,} mandals {df.mkey.nunique()} | LEAVE-MANDAL-OUT (no own sensor)")
    print(f"  {'model':42s} {'MAE':>6} {'RMSE':>6} {'R2':>5}")
    exps=[
      ("A location only",                  ["lat","lon"],[],False),
      ("B + real Sy + aquifer + terrain",  ["lat","lon","specific_yield","elevation"],["aquifer_type"],False),
      ("C + rainfall + GRACE pctl + season",["lat","lon","specific_yield","elevation","rain_12m","grace_gw","grace_root","month_sin","month_cos"],["aquifer_type"],False),
      ("D + IDW neighbour sensors",        ["lat","lon","specific_yield","elevation","rain_12m","grace_gw","grace_root","month_sin","month_cos"],["aquifer_type"],True),
    ]
    for name,num,cat,idw in exps:
        r=cv(num,cat,idw); print(f"  {name:42s} {r[1]:6.2f} {r[0]:6.2f} {r[2]:5.2f}")
    naive=math.sqrt(mean_squared_error(y,np.full_like(y,y.mean())))
    print(f"  {'(naive: predict statewide average)':42s} {mean_absolute_error(y,np.full_like(y,y.mean())):6.2f} {naive:6.2f}")

if __name__=="__main__":
    main()
