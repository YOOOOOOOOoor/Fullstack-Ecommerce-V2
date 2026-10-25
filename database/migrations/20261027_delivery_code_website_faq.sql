-- Keep the seeded support answer aligned with the website-based delivery code flow.
UPDATE store_faqs
SET answer='When your order is out for delivery, open that order’s details page in your account. Give the active code to the driver only after your order arrives. The code expires and can be used once.'
WHERE lower(question)=lower('How do I use the delivery verification code?')
  AND answer LIKE 'A one-time code is sent to the email%';
