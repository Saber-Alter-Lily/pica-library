# Upstream

Pica Library contains MIT-licensed code derived from
[`justorez/pica-cli`](https://github.com/justorez/pica-cli), originally by Neo.

The frozen migration source is commit
`9a8448a49062f22c367fdea1dc10e3acf53fde1d` from
`Saber-Alter-Lily/pica-cli`, which includes the upstream transport, Pica API
client, and downloader foundations together with later library-management work.

The following foundations are upstream-derived or evolved from the frozen
source:

- signed Pica HTTP transport and API response types;
- login, favorites, search, episode, picture, and related-comic requests;
- picture download and basic concurrency behavior;
- the original command-line downloader and archive helper foundations.

Pica Library subsequently adds or substantially restructures:

- canonical persistent library and schema migrations;
- metadata and author-identity normalization;
- explainable collection-based recommendation;
- persistent download queue, scheduler, runners, update and repair workflows;
- portable bundle interchange and browser runtime;
- the Home, Library, Discover, Downloads, and Maintenance information architecture.

Pica Library is maintained as an independent project. This does not imply any
transfer or abandonment of Neo's or other contributors' copyright.
