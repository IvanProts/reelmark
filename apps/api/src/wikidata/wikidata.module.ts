import { Module } from '@nestjs/common';

import { WikidataClient } from './wikidata.client.js';

/** Provides WikidataClient to the modules that import it. */
@Module({
  providers: [WikidataClient],
  exports: [WikidataClient],
})
export class WikidataModule {}
