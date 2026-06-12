export interface ConfigTemplate {
  id: string;
  name: string;
  description: string;
  xml: string;
}

// One template per distinct labeling capability, kept intentionally minimal.
export const TEMPLATES: ConfigTemplate[] = [
  {
    id: 'classification',
    name: 'Classification',
    description: 'Assign one label to the whole text (e.g. sentiment).',
    xml: `<View>
  <Text name="text" value="$text" />
  <Choices name="label" toName="text" choice="single">
    <Choice value="Positive" />
    <Choice value="Negative" />
    <Choice value="Neutral" />
  </Choices>
</View>`,
  },
  {
    id: 'ner',
    name: 'Named Entity Recognition',
    description: 'Highlight spans and tag them with entity types.',
    xml: `<View>
  <Labels name="label" toName="text">
    <Label value="Person" />
    <Label value="Organization" />
    <Label value="Location" />
  </Labels>
  <Text name="text" value="$text" />
</View>`,
  },
  {
    id: 'relations',
    name: 'Relation Extraction',
    description: 'Tag entities, then link them with a relation.',
    xml: `<View>
  <Relations>
    <Relation value="related to" />
  </Relations>
  <Labels name="label" toName="text">
    <Label value="Subject" />
    <Label value="Object" />
  </Labels>
  <Text name="text" value="$text" />
</View>`,
  },
  {
    id: 'absa',
    name: 'Aspect-Based Sentiment',
    description: 'Mark each aspect span and rate its sentiment.',
    xml: `<View>
  <Labels name="aspect" toName="text">
    <Label value="Aspect" />
  </Labels>
  <Text name="text" value="$text" />
  <Choices name="sentiment" toName="text" perRegion="true" choice="single">
    <Choice value="Positive" />
    <Choice value="Negative" />
    <Choice value="Neutral" />
  </Choices>
</View>`,
  },
  {
    id: 'summarization',
    name: 'Summarization',
    description: 'Write a free-text summary of the document.',
    xml: `<View>
  <Text name="text" value="$text" />
  <TextArea name="summary" toName="text" rows="4" placeholder="Write a summary..." />
</View>`,
  },
];

export const templateById = (id: string): ConfigTemplate | undefined =>
  TEMPLATES.find((t) => t.id === id);
