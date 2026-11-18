# Traccar (installed separately, not vendored)

Traccar is an open-source GPS tracking server (Apache-2.0), https://www.traccar.org .
Phase 0 runs release 6.x locally, bound to 127.0.0.1, with two protocols on:

| Protocol | Port | Used by |
|---|---|---|
| OsmAnd (HTTP) | 5055 | Driver phone apps (Traccar Client), and our replay script |
| H02 | 5013 | Mictrack MT909-class hardwired trackers (H02 protocol) |

Install without root: download `traccar-linux-64-<ver>.zip` from the releases page, extract the
makeself payload of `traccar.run` with `--noexec --target`, copy `traccar.xml` from this folder into
`conf/`, then run `./jre/bin/java -jar tracker-server.jar conf/traccar.xml`. Create an admin user and a
device with unique id `ACC-VAN-1` in the web UI (http://127.0.0.1:8082), then put the URL and
login in `.env` (gitignored).
