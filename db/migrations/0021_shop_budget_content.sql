update public.site_settings
set value = jsonb_set(
  value,
  '{shopBudget}',
  jsonb_build_object(
    'eyebrow', 'Shop your way',
    'headline', 'Tell us your budget',
    'body', 'Choose a live price range or enter your own amount. We''ll show what fits, including custom cake ideas.',
    'inputLabel', 'My maximum budget',
    'inputPlaceholder', 'e.g. 75',
    'buttonLabel', 'Find my options',
    'productsTitle', 'Ready to order within your budget',
    'cakesTitle', 'Custom cakes we can build within your budget',
    'emptyProducts', 'No ready-to-order products currently fit this amount.',
    'emptyCakes', 'No fixed-price custom cake combination currently fits this amount.',
    'recommendationLabel', 'Budget cake idea',
    'disclaimer', 'Product totals and cake estimates exclude delivery and applicable taxes. Custom cake availability is confirmed by the bakery.',
    'rangeAriaLabel', 'Price ranges calculated from currently available products',
    'productSingular', 'product',
    'productPlural', 'products',
    'resultPrefix', 'Showing options',
    'fromLabel', 'from',
    'toLabel', 'to',
    'upToLabel', 'up to',
    'clearLabel', 'Clear budget',
    'catalogueEyebrow', 'Live catalogue',
    'cakesEyebrow', 'Built for your budget',
    'customizeLabel', 'Customize this cake',
    'validationError', 'Enter a budget greater than zero.',
    'presetTitle', 'Budget-friendly starting point loaded',
    'presetBody', 'We selected one available choice at every priced step. Review each choice and make it yours.'
  ),
  true
),
updated_at = timezone('utc', now())
where key = 'content'
  and not (value ? 'shopBudget');
