# Űrfigyelő

Kis, kamerás böngészős bújócska játék. Az őrszem az arcot érzékeli, a videóképet nem küldi sehova.

## Indítás VS Code-ból

1. Nyisd meg ezt a mappát VS Code-ban.
2. Telepítsd a **Live Server** bővítményt, ha még nincs meg.
3. Nyisd meg az `index.html` fájlt, majd kattints a jobb alsó **Go Live** gombra.
4. Válaszd az **Induljon a játék** gombot, majd engedélyezd a kamera használatát a böngészőben.

A böngészők adatvédelmi okból csak biztonságos kapcsolaton engedik a kamerát. A Live Server helyi címe (`localhost`) erre megfelelő. A kamerás arcfelismeréshez internetkapcsolat kell, mert a MediaPipe könyvtár és az arcfelismerő modell az első indításkor töltődik le.

## Játékszabályok

- Az arcod legyen a kamera képében, amikor nincs riasztás.
- Nyugodt űrnél is gyere vissza 4 másodpercen belül, ha az őrszem elveszíti az arcodat. Ez a számláló a piros **BÚJJ EL!** riasztás alatt nem fut; az elbújás után külön indul a visszatérési idő.
- A piros **BÚJJ EL!** jelzés után tűnj el a kamera elől. Minden új szinten kevesebb időd lesz.
- Miután elbújtál, jelenj meg újra, mielőtt lejár a visszaszámlálás. A visszatérésre kapott idő is fokozatosan csökken.
- A szintek végtelenek, a nehézség fokozatosan, mérsékelten nő. A harmadik szinttől váratlan helyzetek jöhetnek: hamis riasztásnál maradj látható, kettős riasztásnál bújj el még egyszer, az őrszem lemenetelekor pedig siess vissza a képbe.
- Az ötödik szinttől sűrűbbek a riasztások, gyorsabban csökken a reakcióidő, és új csapdák jöhetnek: visszhangriasztás után indul az igazi jelzés, villámriasztásnál pedig csak körülbelül 2 másodperced van elbújni.
- A hetedik szinttől ritkán bónusz légzsilip is jöhet, ami plusz időt ad a visszatérésre.

## Közös top 10 ranglista

A játékos a kezdőlapon adhat meg egy 2–16 karakteres nevet. A közös ranglista Supabase-adatbázist használ; ehhez szükséges a `leaderboard-schema.sql` futtatása a projekt SQL Editorában, majd a projekt URL-jének és anon kulcsának beírása a `leaderboard-config.js` fájlba. Kizárólag a nyilvános anon kulcs használható a böngészőben, a service role kulcsot soha ne tedd közzé.

A lista az azonos névvel elért legjobb szintet tartja meg. A pontszámot a böngésző küldi be, ezért ez baráti ranglista, nem csalásbiztos verseny.

Az arcfelismerés és a kamera képe a böngészőben, a saját eszközödön fut. A program nem rögzíti és nem tölti fel a videót. A kamera használata a böngésző kameragombjával bármikor leállítható.
