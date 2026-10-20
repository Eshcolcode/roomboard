-- 0012 (20 Oct 2026): Donald asked to drop "Formerly Eshcol Guest House" from the Eshcol address line.
-- 0004/0008 are already applied on live, so the change is made here.
-- No new functions; nothing to grant (0010's lockdown is unaffected).
update properties
   set address = '21 Breasclete, Isle of Lewis HS2 9ED'
 where id = 'p-es' and address ilike 'Formerly Eshcol Guest House%';
