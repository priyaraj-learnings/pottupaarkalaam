-- The text inside the business's own UPI QR (upi://pay?pa=…&mc=…&aid=…&tr=…),
-- pasted or read from a photo in /admin Settings. The app's pay buttons and
-- QR then carry the same merchant details (category code, Google Pay merchant
-- ID and reference), adding only the amount and note, so UPI apps see a
-- payment to the verified business rather than a plain link.

alter table public.app_settings add column if not exists upi_qr_text text;
alter table public.app_settings drop constraint if exists app_settings_upi_qr_check;
alter table public.app_settings add constraint app_settings_upi_qr_check check (
  upi_qr_text is null or (length(upi_qr_text) <= 600 and upi_qr_text ~* '^upi://pay\?')
);

notify pgrst, 'reload schema';
