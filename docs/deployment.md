# Besplatna objava portala

Status: objavljeno i provereno 28. oktobra 2026. Portal: [gameops-portal.onrender.com](https://gameops-portal.onrender.com/). Kod: [privatni GitHub repozitorijum](https://github.com/petroviner-web/game-operations-portal). Render servis `gameops-portal` koristi Free plan; Neon projekat `geops` koristi Free plan, PostgreSQL 18 i region Frankfurt. Nije dodat način plaćanja niti aktiviran plaćeni servis tokom ove objave.

## Arhitektura i trošak

```text
Browser --HTTPS--> Render Free: Next.js --loopback HTTP--> NestJS
                                                          |
                                                     TLS PostgreSQL
                                                          |
                                                       Neon Free
```

Jedan Render Web Service pokreće oba Node procesa. Next.js sluša javni port; NestJS ostaje na `127.0.0.1:4000`. Dovoljan je jedan servis i čuvamo isti origin za sesije i CSRF. Procesi dele RAM i restartuju se zajedno; nezavisno skaliranje nije deo ovog portfolio izdanja.

Dokumentacija proverena 27. oktobra 2026:

- [Render Free](https://render.com/docs/free) uspavljuje servis nakon 15 minuta bez poseta; ponovno pokretanje može trajati oko minut. Postoje mesečne kvote. Bez platne metode prekoračenje saobraćaja zaustavlja servis, a prekoračenje build kvote zaustavlja nove buildove. Ne dodaj karticu i ne prelazi na plaćeni plan. Ako servis zatraži karticu za verifikaciju, stani i proveri alternativu.
- [Neon Free](https://neon.com/pricing) nema vremenski rok ni obaveznu karticu, ali ima kvote prostora, računanja i saobraćaja. Proveri Free plan u konzoli pre kreiranja projekta.
- Renderova besplatna PostgreSQL baza ističe posle 30 dana, zato je manifest ne kreira.
- Render daje [adresu na `onrender.com`](https://render.com/docs/web-services); domen ne kupujemo.

Planovi mogu da se promene. Zahtev je da nema plaćanja: koristi Free bez kartice, prihvati pauzu pri limitu i ne uključuj automatsku nadogradnju. Ne koristi keep-alive pingove radi sprečavanja uspavljivanja.

## Prvo objavljivanje

1. Prijavi se na GitHub, [Render](https://dashboard.render.com/) i [Neon](https://console.neon.tech/). Za Render i Neon možeš koristiti GitHub prijavu. Izaberi Free bez kartice.
2. Napravi zaseban GitHub repozitorijum za **sadržaj foldera `game-operations-portal`**. Može biti privatan. Ne šalji nadređeni folder `Diplomski`. Izostavi `.env*` osim `.env.example`, `.local`, `node_modules`, buildove, rezultate testova i sertifikate. Proveri spisak fajlova pre slanja. Manifest i CI očekuju portal u korenu repozitorijuma.
3. U Neon Free projektu kreiraj PostgreSQL bazu u evropskom regionu blizu Frankfurta. Uzmi direktan connection string sa isključenim connection pooling-om. Migracije koriste advisory lock vezan za konekciju, zato transaction-pooling URL nije pogodan za ovaj zajednički `DATABASE_URL`.
4. Connection string unesi **direktno u Render secret polje**, ne u chat, GitHub ili kod. Postavi `sslmode=verify-full` u URL-u da klijent proverava sertifikat i ime servera. Ne isključuj TLS verifikaciju; ostale potrebne Neon parametre zadrži.
5. Na Renderu otvori **New → Blueprint**, poveži samo repozitorijum portala i upotrebi `render.yaml`. Pre potvrde proveri da postoji tačno jedan Web Service sa planom **Free**, bez Render baze i drugih resursa. Ako se prikazuje cena veća od nule, ne pokreći objavu.
6. Unesi Neon URL u `DATABASE_URL`. `CSRF_SECRET` generiše Render. `APP_ORIGIN` se automatski preuzima iz `RENDER_EXTERNAL_URL`, a javni port iz `PORT`. Manifest podešava Next.js na `0.0.0.0`.
7. Posle builda i statusa Live otvori dodeljeni HTTPS link. Proveri `/api/v1/health/ready`, registraciju, odjavu/prijavu, projekat, sesiju sa dva igrača, završetak i analitiku. Lokalni podaci se ne kopiraju na hosting.

Prijave, CAPTCHA i 2FA koraci obavljaju se na stranicama servisa. Lozinke i tokene ne šalji u razgovor.

## Pokretanje i održavanje

Za traženje zahteva po `X-Request-Id`, tumačenje JSON logova, dijagnostiku i rollback koristi [operativno uputstvo](operations.md). Za predstavljanje projekta i završni pregled koristi [demo scenario](demo-and-review.md). Praćenje zahteva koristi postojeće Render logove; nije dodat plaćeni monitoring.

Build: `npm ci --include=dev && npm run build`. Start: `npm run start:release`.

Start skripta proverava produkcionu konfiguraciju, HTTPS origin i slaganje API adrese sa izgrađenim Next.js rewrite-om. Primenjuje nedostajuće migracije, pa pokreće oba servera. Ne ispisuje tajne u greškama. Migration lock čeka najviše 10 sekundi, SQL naredba najviše 30 sekundi; neuspeh sprečava start. Otkaz jednog servera zaustavlja drugi. SIGTERM/SIGINT zaustavlja oba, uz maksimalno 10 sekundi do prinudnog prekida. Signali na Windows-u imaju drugačije ponašanje nego na Linux-u; hosting koristi Linux.

Za drugi hosting postavi HTTPS `APP_ORIGIN`, `DATABASE_URL`, nasumični `CSRF_SECRET` od najmanje 32 znaka, `WEB_HOST=0.0.0.0`, `PORT` i `API_PORT`. Start skripta forsira `NODE_ENV=production` za oba servera. `API_ORIGIN` mora odgovarati loopback API portu **pri buildu i startu**. Produkcioni start ne učitava lokalni `.env`; tajne dolaze iz hostinga.

Automatski deploy je isključen. Posle prolaska CI provera koristi ručni deploy. Pre budućih promena šeme izvezi bazu preko `pg_dump` u privatno skladište i proveri restore u posebnu bazu. Ne menjaj primenjene migracije; dodaj novu. Vraćanje prethodnog koda ne vraća bazu: prednost imaju aditivne, unazad kompatibilne promene. Za destruktivne promene unapred pripremi restore postupak.

## Provere i granice

- `npm run test:release`: konfiguracija, nepodudarne build/runtime adrese i gašenje drugog procesa posle otkaza prvog.
- `npm run test:release:https`: zaseban produkcioni build `.next-release-test`, portovi 3300/4300 i lokalni HTTPS proxy na 3443. Zahteva Playwright Chromium, OpenSSL (ili `OPENSSL_PATH`) i zaseban `TEST_DATABASE_URL` sa imenom koje se završava na `_test`. Postojeći razvojni server se ne zaustavlja.
- HTTPS test pravi jednodnevni sertifikat u ignorisanom `.local` folderu; ne menja sistemski trust store. Samo njegov browser kontekst prihvata taj sertifikat. Proverava Secure/HttpOnly/`__Host-` sesiju, CSRF, registraciju, prijavu, projekat, dva igrača, završetak sesije, analitiku, odjavu i zaštitu rute. Briše svoj test nalog i njegove podatke.

Ako Windows rezerviše podrazumevane test portove, koristi slobodan port bez menjanja rezervacija sistema. Na ovom računaru 28. oktobra portovi 3443 i 4100 bili su rezervisani. PowerShell primeri (samo za testove):

```powershell
$env:RELEASE_HTTPS_PORT = '34430'
npm run test:release:https
$env:E2E_API_PORT = '4310'
npm run test:e2e
```

Test i dalje proverava da port nije zauzet i ne preuzima postojeći server. Web test port ostaje 3100, a produkcioni test serveri 3300/4300. Nijedno od ovih podešavanja ne menja portove Render servisa.

Stvarni rezultati su u [verification.md](verification.md). Lokalni test ne potvrđuje Render ingress, stvarnu Neon konekciju, raspoloživost Free plana ni RAM pod opterećenjem. Javna adresa je proverena; detalji su u verification.md. Portfolio demo nema verifikaciju mejla, obnovu lozinke ili garantovanu dostupnost. Trenutni peer limit prijava deli sve korisnike iza Next proxy-ja; za veći saobraćaj treba pouzdano identifikovati klijente i dodati edge limit.
