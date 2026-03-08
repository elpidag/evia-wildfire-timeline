import { collection, config, fields } from '@keystatic/core';
import {
  actorTypeValues,
  categoryValues,
  confidenceValues,
  datePrecisionValues,
  verificationStatusValues,
  placeTypeValues
} from './src/lib/data/schemas';

const categoryOptions = categoryValues.map((value) => ({ label: value, value }));
const actorTypeOptions = actorTypeValues.map((value) => ({ label: value, value }));
const placeTypeOptions = placeTypeValues.map((value) => ({ label: value, value }));
const idDescription = 'Use stable lowercase IDs (e.g. evia-2021-example). Avoid renaming IDs after publishing.';

export default config({
  storage: {
    kind: 'local'
  },
  collections: {
    events: collection({
      label: 'Events',
      path: 'src/content/events/**',
      slugField: 'slug',
      format: { contentField: 'content' },
      columns: ['title', 'start', 'category', 'datePrecision'],
      schema: {
        id: fields.text({ label: 'ID', description: idDescription, validation: { isRequired: true } }),
        slug: fields.text({
          label: 'Slug',
          description: 'Used for URL/query references. Keep this stable once public links exist.',
          validation: { isRequired: true }
        }),
        title: fields.text({ label: 'Title', validation: { isRequired: true } }),
        start: fields.text({ label: 'Start Date (YYYY | YYYY-MM | YYYY-MM-DD)', validation: { isRequired: true } }),
        end: fields.text({
          label: 'End Date',
          description: 'Optional for duration events; leave empty for point events.'
        }),
        datePrecision: fields.select({
          label: 'Date Precision',
          options: datePrecisionValues.map((value) => ({ label: value[0].toUpperCase() + value.slice(1), value })),
          defaultValue: 'day'
        }),
        isOngoing: fields.checkbox({ label: 'Ongoing', defaultValue: false }),
        category: fields.select({
          label: 'Category',
          options: categoryOptions,
          defaultValue: 'legislation'
        }),
        summary: fields.text({ label: 'Summary', multiline: true, validation: { isRequired: true } }),
        actors: fields.array(
          fields.text({ label: 'Actor ID', description: 'Reference an entry from the actors collection.', validation: { isRequired: true } }),
          {
            label: 'Actors',
            itemLabel: (props) => props.value || 'Actor',
            validation: { length: { min: 1 } }
          }
        ),
        places: fields.array(
          fields.text({ label: 'Place ID', description: 'Reference an entry from the places collection.', validation: { isRequired: true } }),
          {
            label: 'Places',
            itemLabel: (props) => props.value || 'Place',
            validation: { length: { min: 1 } }
          }
        ),
        tags: fields.array(fields.text({ label: 'Tag', validation: { isRequired: true } }), {
          label: 'Tags',
          itemLabel: (props) => props.value || 'Tag'
        }),
        sourceRefs: fields.array(
          fields.text({
            label: 'Source Ref ID',
            description: 'Reference an id from src/references/sources.json.',
            validation: { isRequired: true }
          }),
          {
            label: 'Source References',
            itemLabel: (props) => props.value || 'Source',
            validation: { length: { min: 1 } }
          }
        ),
        imageRefs: fields.array(fields.text({ label: 'Image Ref ID', validation: { isRequired: true } }), {
          label: 'Image References',
          itemLabel: (props) => props.value || 'Image'
        }),
        coverImage: fields.text({
          label: 'Cover Image Ref ID',
          description: 'Must match one of the imageRefs values if present.'
        }),
        confidence: fields.select({
          label: 'Confidence',
          options: [{ label: '(none)', value: '' }, ...confidenceValues.map((value) => ({ label: value, value }))],
          defaultValue: ''
        }),
        verificationStatus: fields.select({
          label: 'Verification Status',
          options: [
            { label: '(none)', value: '' },
            ...verificationStatusValues.map((value) => ({ label: value, value }))
          ],
          defaultValue: ''
        }),
        relatedEvents: fields.array(fields.text({ label: 'Related Event ID', validation: { isRequired: true } }), {
          label: 'Related Events',
          itemLabel: (props) => props.value || 'Event'
        }),
        featured: fields.checkbox({ label: 'Featured', defaultValue: false }),
        content: fields.markdoc({
          label: 'Event Commentary',
          extension: 'md',
          description: 'Long-form context, uncertainty notes, and links to related process evidence.'
        })
      }
    }),
    actors: collection({
      label: 'Actors',
      path: 'src/content/actors/*',
      slugField: 'slug',
      format: { contentField: 'content' },
      columns: ['name', 'type'],
      schema: {
        id: fields.text({ label: 'ID', description: idDescription, validation: { isRequired: true } }),
        slug: fields.text({ label: 'Slug', validation: { isRequired: true } }),
        name: fields.text({ label: 'Name', validation: { isRequired: true } }),
        type: fields.select({ label: 'Type', options: actorTypeOptions, defaultValue: 'state-agency' }),
        aliases: fields.array(fields.text({ label: 'Alias', validation: { isRequired: true } }), {
          label: 'Aliases',
          itemLabel: (props) => props.value || 'Alias'
        }),
        parentActors: fields.array(fields.text({ label: 'Parent Actor ID', validation: { isRequired: true } }), {
          label: 'Parent Actors',
          itemLabel: (props) => props.value || 'Parent'
        }),
        summary: fields.text({ label: 'Summary', multiline: true, validation: { isRequired: true } }),
        tags: fields.array(fields.text({ label: 'Tag', validation: { isRequired: true } }), {
          label: 'Tags',
          itemLabel: (props) => props.value || 'Tag'
        }),
        website: fields.url({ label: 'Website', description: 'Optional external website URL' }),
        content: fields.markdoc({ label: 'Profile Notes', extension: 'md' })
      }
    }),
    places: collection({
      label: 'Places',
      path: 'src/content/places/*',
      slugField: 'slug',
      format: { contentField: 'content' },
      columns: ['name', 'type'],
      schema: {
        id: fields.text({ label: 'ID', description: idDescription, validation: { isRequired: true } }),
        slug: fields.text({ label: 'Slug', validation: { isRequired: true } }),
        name: fields.text({ label: 'Name', validation: { isRequired: true } }),
        type: fields.select({ label: 'Type', options: placeTypeOptions, defaultValue: 'region' }),
        center: fields.array(fields.number({ label: 'Coordinate' }), {
          label: 'Center [lon, lat]',
          validation: {
            length: { min: 2, max: 2 }
          },
          itemLabel: (props) => `${props.value}`
        }),
        bbox: fields.array(fields.number({ label: 'BBox Value' }), {
          label: 'BBox [minLon, minLat, maxLon, maxLat]',
          validation: {
            length: { min: 4, max: 4 }
          },
          itemLabel: (props) => `${props.value}`
        }),
        parentPlace: fields.text({ label: 'Parent Place ID' }),
        notes: fields.text({ label: 'Notes', multiline: true }),
        content: fields.markdoc({ label: 'Place Notes', extension: 'md' })
      }
    }),
    pages: collection({
      label: 'Pages',
      path: 'src/content/pages/*',
      slugField: 'slug',
      format: { contentField: 'content' },
      columns: ['title', 'updatedAt'],
      schema: {
        id: fields.text({ label: 'ID', description: idDescription, validation: { isRequired: true } }),
        slug: fields.text({ label: 'Slug', validation: { isRequired: true } }),
        title: fields.text({ label: 'Title', validation: { isRequired: true } }),
        summary: fields.text({ label: 'Summary', multiline: true, validation: { isRequired: true } }),
        updatedAt: fields.datetime({
          label: 'Updated At',
          defaultValue: { kind: 'now' }
        }),
        content: fields.markdoc({ label: 'Page Body', extension: 'md' })
      }
    })
  }
});
