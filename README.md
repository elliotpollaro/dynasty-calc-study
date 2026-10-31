# Dynasty Trade Calculator Accuracy Study: Trade Browser

This page shows every trade from a pre-registered study that compared four dynasty trade calculators (KeepTradeCut, FantasyCalc, Dynasty Daddy and Dynasty Dealer) with verdicts from r/DynastyFFTradeAdvice. For each trade it shows:

- the crowd's counted votes, with links to the comments;
- each calculator's numbers and its call;
- the screenshot behind each reading.

**Disclosure:** prepared by Elliot Pollaro, who runs Dynasty Dealer, one of the four calculators.

- Registered plan: https://doi.org/10.17605/OSF.IO/TYNQ7
- Data and code: https://doi.org/10.17605/OSF.IO/8UG93

## How it's built

Everything on the page is generated from the published files by `build/build_browser.mjs`. Nothing is typed by hand.

The build fails unless:

- the page's calls reproduce the published results exactly; and
- every thread's counted votes rebuild to the locked verdict file.

The build also needs `analysis_lib.mjs` and `lib.mjs` from the study's `code/` folder. To rebuild:

```
node build_browser.mjs --study <unzipped calc-accuracy-2026-10-30> --live <unzipped dd-live-2026-10-31> --out <site folder>
```

## License

- **Code:** MIT.
- **Data and text:** CC BY-NC 4.0.
- **Screenshots:** they show the calculators' websites on 2026-10-30 and 2026-10-31. Content from KeepTradeCut, FantasyCalc and Dynasty Daddy belongs to those sites.
- **Reddit:** threads and comments are linked by ID, and no usernames are shown.
