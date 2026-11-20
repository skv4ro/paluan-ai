# PALUAN – tlačidlo AI pre Prodboard

Zostavený nástroj `prodboard-ai.js` pre konštruktor Prodboard (inštancia PALUAN).
Načítava ho krátky zavádzač zo skriptu inštancie cez jsDelivr:

https://cdn.jsdelivr.net/gh/skv4ro/paluan-ai@main/prodboard-ai.js

Súbor sa negeneruje tu — vzniká príkazom `node build-dist.js` (dist/web/prodboard-ai.js) a nahráva sa sem.
Zoznam povolených používateľov tu nie je, je len v zavádzači v administrácii Prodboardu.

Po nahratí novej verzie vyčisti cache jsDelivr:
https://purge.jsdelivr.net/gh/skv4ro/paluan-ai@main/prodboard-ai.js
