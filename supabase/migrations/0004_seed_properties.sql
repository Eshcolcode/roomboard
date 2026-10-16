-- Real property/room structure (no guest data). Confirmed by Donald 16 Oct 2026.
insert into properties (id,name,short_name,contracted,address,blurb,photo_url,features,beds_label,brand,sort) values
 ('p-lr','Loch Roag Guest House','Loch Roag',true,'22A Breasclete, Isle of Lewis HS2 9EF','9 bedrooms: 1–5 upstairs, 6–9 downstairs. Rooms 2 & 3 share a shower room, Room 8 has a private shower room, the rest are ensuite. Images to follow.',null,'{9 bedrooms,2 kitchens,Games room & lounge}',null,null,1),
 ('p-es','Eshcol Worker Accommodation','Eshcol',true,'Formerly Eshcol Guest House, Breasclete','10 bedrooms: main house Rooms 1–7 and downstairs flat Rooms 8–10.','img/eshcol-exterior.jpg','{Parking,High-speed Wi-Fi,Laundry,Games room}',null,null,2),
 ('p-pod1','Pod 1','Pod 1',false,'Isle of Lewis','Self-contained 1-bedroom pod.',null,'{1 bed,Self-contained}','1 bedroom','Hebridean Holiday Cabins',3),
 ('p-pod2','Pod 2','Pod 2',false,'Isle of Lewis','Self-contained 1-bedroom pod.',null,'{1 bed,Self-contained}','1 bedroom','Hebridean Holiday Cabins',4),
 ('p-lodge','The Lodge','Lodge',false,'Isle of Lewis','2-bedroom lodge, both bedrooms ensuite.',null,'{2 ensuite bedrooms,Kitchen}','2 bedrooms · both ensuite','Hebridean Holiday Cabins',5),
 ('p-cottage','The Cottage','Cottage',false,'Isle of Lewis','2 ensuite bedrooms plus a home office.',null,'{2 ensuite bedrooms,Home office}','2 bedrooms + office','Hebridean Holiday Cabins',6),
 ('p-monadh','Monadh','Monadh',false,'Whitefalls, Breasclete','The one Whitefalls Spa Lodge currently available.',null,'{Spa lodge,Self-contained}','Spa lodge','Whitefalls Spa Lodges',7);
insert into units values ('un-lr-up','p-lr','Upstairs · Rooms 1–5',1),('un-lr-down','p-lr','Downstairs · Rooms 6–9',2),('un-es-main','p-es','Main house · Rooms 1–7',1),('un-es-flat','p-es','Downstairs flat · Rooms 8–10',2);
insert into rooms (id,property_id,unit_id,name,floor,bath,note,photo_url,sort)
 select 'lr-'||i,'p-lr', case when i<=5 then 'un-lr-up' else 'un-lr-down' end,'Room '||i, case when i<=5 then 'Upstairs' else 'Downstairs' end,
  (case when i in (2,3) then 'shared' when i=8 then 'private' else 'ensuite' end)::bath_kind,
  case when i=2 then 'Shares a shower room with Room 3' when i=3 then 'Shares a shower room with Room 2' when i=8 then 'Private shower room (not ensuite)' else 'Ensuite' end, null, i from generate_series(1,9) i;
insert into rooms (id,property_id,unit_id,name,floor,bath,photo_url,sort) select 'es-'||i,'p-es', case when i<=7 then 'un-es-main' else 'un-es-flat' end,'Room '||i, case when i<=7 then 'Main house' else 'Downstairs flat' end,
 (array['private','ensuite','ensuite','ensuite','private','ensuite','ensuite','shared','shared','ensuite'])[i]::bath_kind,'img/eshcol-room'||i||'.jpg',i from generate_series(1,10) i;
