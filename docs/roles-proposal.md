# Predlog uloga za GameOpen

Status: lokalna implementacija Owner + Developer; Viewer i administrator su buduće mogućnosti. Pogledati `verification.md` za stvarne rezultate i status objave. Simulirani igrači nisu nalozi i nemaju dozvole u portalu.

## Dva nivoa pristupa

Globalno, svaki registrovani nalog je korisnik portala. Poseban sistemski administrator može da obavlja dogovorene administrativne poslove, ali se ne pretpostavlja da automatski može da čita sadržaj svih projekata. Administratorske funkcije i opseg pristupa treba posebno definisati pre implementacije.

U okviru jednog projekta:

| Uloga | Pregled projekta i analitike | Izmena projekta i simulacija | Članovi i arhiviranje |
| --- | --- | --- | --- |
| Owner | Da | Da | Da |
| Developer | Da | Da | Ne |
| Viewer | Da | Ne | Ne |

Owner je postojeći vlasnik projekta; ista osoba može biti developer na drugom projektu. Developer nije globalni tip naloga i ne daje sebi pristup sam. Viewer je član projekta sa pravom čitanja, a ne korisnik koji automatski vidi sve javne ili privatne projekte. Kreiranje projekta ostaje dostupno registrovanim korisnicima, kao danas. Članovi ne mogu da menjaju vlasnika niti sami sebi daju višu ulogu.

## Predlog implementacije po koracima

1. **Članstvo i autorizacija:** dodati tabelu `project_members` sa `project_id`, `user_id`, `role` (`developer` ili `viewer`), `created_at`, jedinstvenim parom `(project_id,user_id)` i FK vezama. `projects.owner_id` ostaje autoritativni vlasnik; postojeći projekti i vlasnici ne zahtevaju prepisivanje. Owner ne dobija dodatni red. Dosledno proveriti owner ili članstvo u upitima za projekte, sesije i analitiku, i za čitanje i za pisanje; proveravati i arhivirane projekte. Definisati ponašanje kada se članstvo ukloni dok je zahtev u toku, uz transakcije/zaključavanje tamo gde je potrebno.
2. **Upravljanje članovima:** Owner može da vidi članove, doda postojeći nalog, promeni njegovu projektnu ulogu i ukloni ga. Odabrati pozivnice ili direktno dodavanje pre javne objave: direktno traženje po emailu može da otkrije postojanje naloga. Pozivnice zahtevaju bezbedan tok prihvatanja; nije pretpostavljeno da demo već ima email servis. Promena članstva mora koristiti postojeće provere sesije i CSRF-a; korisnik ne sme da dodeljuje pristup projektima koji nisu njegovi.
3. **Administrator:** zasebna globalna uloga tek nakon odluke o konkretnim operacijama, prvom administratoru, zaštiti od samododele i evidenciji administrativnih radnji. Javni obrazac registracije nikada ne bira administratora. Ne menjati postojeće produkcione naloge bez jasnog načina dodele i provere.
4. **Interfejs i testovi:** prikazati ulogu i dozvoljene akcije u Next.js-u, ali odluke sprovoditi u NestJS-u i PostgreSQL upitima. Pokriti izolaciju dva projekta i više korisnika, svaku dozvolu, odbijanje eskalacije, opoziv pristupa, istovremene promene i stare owner naloge; koristiti odvojenu test bazu. Dodati desktop/mobilne tokove i proveriti da 404 ne otkriva tuđe privatne projekte.

## Praktične odluke za pregled

- Da li owner treba da poziva samo postojeće naloge ili i ljude koji se još nisu registrovali? To određuje model pozivnica i eventualnu potrebu za email servisom.
- Koje tačno poslove obavlja sistemski administrator? Ako je jedini korisnik vlasnik portala i nema operativnog zadatka, administrator može da sačeka.
- Da li je Viewer potreban odmah ili je dovoljan Owner + Developer? Dodavati ga kada postoji potreba za pristupom samo za čitanje.

Za produkcionu bazu potrebna je nova aditivna migracija, provera kompatibilnosti i unapred pripremljen i proveren backup/restore. Postojeće migracije se ne menjaju. Promena ne uvodi automatski pouzdano praćenje admin radnji, email verifikaciju ni stvarne multiplayer igrače.

## Implementirani API za postojeće naloge

`GET /api/v1/projects/:id/members` vraća developere samo vlasniku. `POST /api/v1/projects/:id/members` prihvata isključivo `{ "email": "..." }`, dodaje postojeći nalog i vraća istu poruku i kada nalog ne postoji ili je to vlasnik. `DELETE /api/v1/projects/:id/members/:userId` opoziva pristup i bezbedan je za ponavljanje. Promene zahtevaju sesiju i CSRF; zahtevi za dodavanje su ograničeni na 20 po nalogu na 15 minuta. Arhivirani projekat ne prihvata nova članstva, ali opoziv je dozvoljen. Spisak članova omogućava vlasniku da proveri da li je konkretan email dodat: generička poruka i ograničenje pokušaja smanjuju, ali ne uklanjaju, rizik otkrivanja postojanja naloga. Ovo je otvoreno ograničenje direktnog dodavanja; za ozbiljniju javnu upotrebu potreban je tok pozivnice uz pristanak i dodatne zaštite.

Upisi u projekat i sesije prvo zaključavaju projekat, a zatim u zasebnoj naredbi proveravaju aktuelno članstvo. Dodavanje i uklanjanje članova uzimaju ekskluzivnu bravu istog projekta; zato se opoziv i promene serijalizuju. Zahtevi koji su već završili pre opoziva nisu retroaktivno poništeni. Čitanja koriste proveru u SQL-u i ne izlažu tuđe projekte.
