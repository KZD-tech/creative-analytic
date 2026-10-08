-- Restricts which workspaces an Onpay donation's ad code is even allowed to
-- match against, using the invoice_number prefix of the form it came
-- through — a stronger signal than the ad code alone when the exact same
-- code can legitimately run on two platforms at once. Null means "no rule
-- yet" — those donations keep matching across the whole account, same as
-- before this existed.
alter table campaigns add column onpay_form_prefix text;

update campaigns set onpay_form_prefix = 'GYT' where id = 'gads-ihsanku';
update campaigns set onpay_form_prefix = 'FB' where id in ('im-1', 'im-2', 'im-3', 'im-4', 'im-5');
