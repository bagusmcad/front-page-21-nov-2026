[![news-image-20261121](https://make.fun/badge/news-image-20261121.svg)](https://make.fun/bounty/news-image-20261121)
[![rank](https://make.fun/badge/news-image-20261121/bagusmcad/front-page-21-nov-2026/rank.svg)](https://make.fun/bounty/news-image-20261121)
[![reward](https://make.fun/badge/news-image-20261121/bagusmcad/front-page-21-nov-2026/reward.svg)](https://make.fun/bounty/news-image-20261121)

# Saturday 21 November 2026 in one page

A one-page newspaper front page of Saturday 21 November 2026, drawn entirely by code.
`main.ts` (Node 22, standard library only, no network) renders a 1024x1024 PNG:
a masthead naming the day, 43 stories with headlines and short decks, 13 illustrated
stories, a world map with 12 numbered pins, and a 12-item digest. The image in this
repo (`entry.png`) is the program's own output, so the repo and the program agree.

## What the image shows

43 stories, all from Saturday 21 November 2026, led by Russia's biggest strike of
the war on Ukraine (400+ drones, 110+ missiles, three Kyiv bridges hit, and two
missiles and a drone landing in Poland), the UK-EU post-Brexit reset signed in
Brussels, COP31 running into overtime in Antalya, the AI stock sell-off pushing
the S&P 500 into correction, and an Anthropic mathematician's unverified claim
that he and Claude proved the Riemann hypothesis.

## Validation and limitations

- `entry.png` is 47,083 bytes, 1024x1024, sha256
  `9b114b31ee097d55cac99bc5674544e836fc0d29504101afe45e2054fd1d09fe`.
- `entry.png` is byte-identical across two runs of `main.ts` (deterministic;
  verified with `cmp`, same sha256 both runs).
- `main.ts` runs its own 17-point self-check on every run (story counts, gate
  limits, pin order, legend fit); all 17 pass. Columns end at y=896, clear of
  the In Brief section at y=920.
- Every story was verified against reporting published on 21 November 2026
  (AP, Reuters, CNN, Fox News, Euronews, IANS, The Neuron, OneTurn, Europa
  Express). The overnight 19-20 November strike is included because it was
  first reported, and led the day's news, on 21 November 2026.
- Two claims that could not be verified well enough were left out or hedged:
  the Riemann proof is labelled unverified in the image, and no casualty
  figure is given where outlets disagreed (reports ranged from 8 to 9 dead).
- The image is drawn entirely by code (own bitmap font + own PNG encoder); no
  photographs are used, so scenes are illustrations, not records of the events.
