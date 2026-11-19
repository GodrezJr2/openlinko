# Car location (Find my car)

> **Opt-in, off by default.** With `"location": false` (or unset) nothing here runs: no thread, no
> `positions` table, no extra requests to CarLinko.

OpenLinko can keep track of where the car is: a **Find my car** map, a **Navigate** button that hands
the spot to your phone's maps app, and the **route of each trip**. The position comes from CarLinko's
own cloud (`/maps/deviceLocate`), the same cached fix the official app shows. Reading it doesn't wake
the car.

Not every car has one. A Tiggo 7 CSH in Malaysia reports a position. A Jaecoo J5 in Indonesia
doesn't: the cloud answers `50052`, and the feature switches itself off after three tries. If you
try it on another model, a note in [#23](https://github.com/GodrezJr2/openlinko/issues/23) helps.

## Before you start
- **It stores where your car has been.** Keep the dashboard on your LAN or Tailscale, or set a
  `dashboard_password`. The logger prints a warning at start-up if location is on without one.
  See [Privacy & security](../README.md#privacy--security).
- The logger must be running (`carlinko-logger`). The server only reads what the logger stored.

## Turn it on
Add to `tools/creds.json` and restart the logger:

```json
{
  "location": true,
  "location_interval": 40,
  "location_parked_interval": 0,
  "location_keep_days": 90
}
```

The log should then say:

```
location: on (every 40s while moving, only on stop while parked, keep 90 days)
```

| Setting | Default | Meaning |
|---|---|---|
| `location` | `false` | `true` turns the feature on. |
| `location_interval` | `30` | Seconds between fixes while driving. **Minimum `30`**: a lower value is raised to 30 (see [How often](#how-often)). `40`–`45` gets a fresh fix almost every time. |
| `location_parked_interval` | `0` | Seconds between fixes while parked. `0` = none: one fix is still read when the car stops and at start-up. Minimum `300` when set. |
| `location_keep_days` | `90` | Days of positions to keep. `0` = forever. |

Settings are read when the logger starts. Restart it after a change.

## What you get
- **Classic** (`/index.html`): a *Find my car* card on the **Trips** tab, with the last fix, its
  age, Navigate and Share. Tap a trip to draw its route.
- **v2** (`/`): a *Location* row on Home and a **Location** page with the map, Navigate, Share,
  *Recent trips* (tap one for its route) and *Back to the car*. `/#loc` opens the page directly.
- **Navigate** opens the device's own chooser: `geo:` on Android (any installed maps app), Apple
  Maps on iPhone and iPad, Google Maps directions on a desktop.
- **Share location** uses the system share sheet where there is one (coordinates plus a Google Maps
  link). Otherwise the button reads **Copy location** and copies the coordinates.

Map tiles come from OpenStreetMap.

## How it works
The logger is the **only** thing that calls CarLinko for the position. It runs as a thread in the
logger process, reuses the logger's `token.txt`, never logs in by itself, and stays silent while
the login guard holds. The server just reads the `positions` table (`/api/location`, `/api/route`).
Every open tab reads that table, never the cloud.

**When a fix is read:**
- every `location_interval` seconds **while the car is moving** (speed > 0, or the odometer went up
  in the last 3 minutes)
- once **when the car stops**, so *Find my car* shows where it was left
- once **at start-up**
- every `location_parked_interval` seconds while parked, if you set it

A start-up or stop fix that fails is retried every 60 s until one lands.

### How often
The car uploads its position to the cloud about **every 30 seconds**. On a Tiggo 7, reads 25–30 s
apart got the same cached fix back 12–15% of the time while driving. Reading faster than the car
uploads only repeats the last fix and adds load on CarLinko's API, so `location_interval` can't go
below 30. A value a little above the upload rate (40–45 s) gets a new fix on almost every read.

### `50052` — no position
`50052 查询定位失败` ("location query failed") has two meanings:
- **The car has no position in the cloud at all** (J5, Indonesia). If the car has **never** produced
  a fix (the `positions` table is empty) and three reads in a row say `50052`, the thread stops
  until the logger restarts. That car makes three requests in total.
- **A one-off gap.** A car that normally reports a position also answers `50052` now and then,
  mid-drive, between good fixes. It isn't a rate limit: the next read is fine. Once the car has any
  fix stored, `50052` is logged and the normal schedule carries on.

### Jump check
Every new fix is compared with the last good one using the great-circle (haversine) distance. The
fix is kept if it is no farther than the car could have driven:

```
allowed km = min(200 km/h × time since the last good fix,  km on the odometer since then + 1)  + 2
```

- The time runs from the last **good** fix, so `50052` gaps only widen the allowance and never cause
  a good fix to be dropped.
- The odometer keeps a parked car tight: parked for a week, a fix may be about 3 km off, not
  33,000. The `+ 1` covers the odometer's whole-km steps. The `+ 2` covers GPS jitter and the age of
  the cloud's cached fix.
- With no telemetry for the period (the logger was down), only the 200 km/h limit applies.
- A fix that fails is dropped, unless **three dropped fixes in a row agree** on a new place. Then
  the car really moved while nothing was read, and the new place is taken.

Checked against 681 real fixes from a Tiggo 7: none dropped, with at least 1.8 km to spare. The
check costs about 11 µs per fix on a Raspberry Pi 5.

### Longitude one digit short
CarLinko has been seen sending the longitude with a digit lost: a car at E 101.77 came back as
`10.177`, and the cloud's own geocoder put it in Cameroon. Reported by
[@anderscheow](https://github.com/anderscheow) in [#23](https://github.com/GodrezJr2/openlinko/issues/23).
When a fix jumps more than **500 km** and `lng × 10` fits the jump check (and lands 10 times
closer), the logger uses `lng × 10` and says so once. This works in any region. The 500 km minimum
means a real drive near longitude 0 (London: −0.12 → −0.012) is never "repaired".

## Log lines

| Line | Meaning |
|---|---|
| `location: on (every 40s while moving, …)` | Started with these settings. |
| `location: WARNING no dashboard_password is set …` | Location is on and the dashboard is open to anyone who can reach it. |
| `location: location_interval=5 is below the minimum, using 30` | Your setting was raised to the floor. |
| `location: no fix this time (50052): call 57 since start, 100 km/h, last fix 31s ago; still trying` | A one-off gap. Nothing to do. |
| `location: CarLinko has no position for this car (50052); location capture is off until the logger restarts` | This car has no cloud position. Set `"location": false`. |
| `location: dropped a fix 44 km from the last one (allowed 3.7 km)` | An impossible jump was ignored. |
| `location: 3 fixes in a row agree on a new place; taking it …` | The car moved while no fix was read. |
| `location: CarLinko sent a longitude one digit short; using it x 10 …` | The cloud quirk above, repaired. |
| `location: request failed: ReadTimeout(…)` | CarLinko didn't answer in time. Retried on the normal schedule. |

None of them print coordinates.

## Turning it off and erasing it
Set `"location": false` and restart the logger. New fixes stop and the card is hidden. Stored
fixes still age out after `location_keep_days`. To erase them now, stop the logger and, next to
`carlinko.db`, run:

```
python -c "import sqlite3; c=sqlite3.connect('carlinko.db'); c.execute('DROP TABLE IF EXISTS positions'); c.commit()"
```

## For developers
The cloud call and its quirks are in [api-map.md → Car position](api-map.md#car-position--mapsdevicelocate),
and the two read-only endpoints in [api-map.md → `/api/location`, `/api/route`](api-map.md#car-position--apilocation-apiroute-opt-in).
The code is the `location` section of `tools/logger.py` (`location_loop`, `_loc_gate`) and
`location_latest` / `location_route` in `tools/server.py`.
