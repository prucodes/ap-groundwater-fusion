# Next Official Data Request

Subject: Data request for Andhra Pradesh mandal-level groundwater fusion PoC

Hi Prakhar/team,

For the next phase of the Mandal-Level Groundwater Fusion Layer PoC, we need official AP groundwater and boundary inputs for 3-5 pilot districts. The public GitHub boundary/name sources currently in the repo are prototype-only and cannot support official mandal-level claims.

Requested files/fields:

1. station/piezometer/sensor ID
2. station name
3. latitude and longitude
4. district
5. mandal
6. village, if available
7. reading date/time
8. groundwater level in mbgl
9. source type: manual / telemetry / piezometer / sensor
10. official mandal boundary GeoJSON/shapefile used by APWRIMS/AWARE
11. APWRIMS admin IDs if available

Preferred format:

- Station readings as CSV or Excel.
- Official mandal boundaries as GeoJSON or shapefile.
- Admin ID crosswalk as CSV if available.

Important caveat:

The PoC will keep APWRIMS/piezometer data as the ground-truth layer. NASA GRACE-FO/GRACE-DA will only be used as supporting satellite/model percentile context and will not be treated as exact groundwater depth.

