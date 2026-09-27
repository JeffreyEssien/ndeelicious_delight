update public.site_settings
set value = jsonb_set(
  value,
  '{shopBudget}',
  coalesce(value->'shopBudget', '{}'::jsonb) || jsonb_build_object(
    'moneyNote', 'Before delivery and applicable tax.',
    'optionSingular', 'option',
    'optionPlural', 'options',
    'withinLabel', 'within',
    'segmentLabel', 'Filter budget matches',
    'allLabel', 'All',
    'readyLabel', 'Ready to order',
    'customCakesLabel', 'Custom cakes',
    'closestPrefix', 'Our closest options currently start at',
    'raiseBudgetLabel', 'Show closest options',
    'viewAllLabel', 'View all {count} matches'
  ),
  true
),
updated_at = timezone('utc', now())
where key = 'content';
