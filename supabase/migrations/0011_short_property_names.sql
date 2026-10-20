-- 0011 (20 Oct 2026): shorter display names, as Donald asked.
--   'Eshcol Worker Accommodation' -> 'Eshcol', 'Loch Roag Guest House' -> 'Loch Roag'.
-- 0004 and 0008 are already applied on live, so the names are changed here rather than in those files.
-- No new functions; nothing to grant (0010's lockdown is unaffected).
update properties set name = 'Eshcol'    where id = 'p-es' and name <> 'Eshcol';
update properties set name = 'Loch Roag' where id = 'p-lr' and name <> 'Loch Roag';
