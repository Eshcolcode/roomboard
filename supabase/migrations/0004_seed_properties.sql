-- Real property/room structure (no guest data). Room names from the Eshcol share page; Loch Roag bathroom split is an assumption, so confirm it.
insert into properties (id,name,short_name,contracted,address,blurb,photo_url,features,beds_label,sort) values
 ('p-lr','Loch Roag Guest House','Loch Roag',true,'22A Breasclete, Isle of Lewis HS2 9EF','9 bedrooms, 7 ensuite, 2 sharing a shower room. Two kitchens, games room and lounge.',null,'{9 bedrooms,2 kitchens,Games room & lounge}',null,1),
 ('p-es','Eshcol Worker Accommodation','Eshcol',true,'Formerly Eshcol Guest House, Breasclete','Newly renovated: private rooms, modern showers, communal kitchen, lounges, games room and separate downstairs flat.','img/eshcol-exterior.jpg','{Parking,High-speed Wi-Fi,Laundry,Games room}',null,2),
 ('p-pod1','Hebridean Pod 1','Pod 1',false,'Isle of Lewis','Self-contained 1-bedroom pod.',null,'{1 bed,Self-contained}','1 bedroom',3),
 ('p-pod2','Hebridean Pod 2','Pod 2',false,'Isle of Lewis','Self-contained 1-bedroom pod.',null,'{1 bed,Self-contained}','1 bedroom',4),
 ('p-lodge','The Lodge','Lodge',false,'Isle of Lewis','2-bedroom lodge, both bedrooms ensuite.',null,'{2 ensuite bedrooms,Kitchen}','2 bedrooms · both ensuite',5),
 ('p-cottage','The Cottage','Cottage',false,'Isle of Lewis','2 ensuite bedrooms plus a home office.',null,'{2 ensuite bedrooms,Home office}','2 bedrooms + office',6);
insert into units values ('un-lr','p-lr','Main house',1),('un-es-main','p-es','Main accommodation',1),('un-es-flat','p-es','Downstairs flat',2);
insert into rooms (id,property_id,unit_id,name,bath,note,photo_url,sort)
 select 'lr-'||i,'p-lr','un-lr','Room '||i, (case when i>=8 then 'shared' else 'ensuite' end)::bath_kind, null, null, i from generate_series(1,9) i;
insert into rooms (id,property_id,unit_id,name,bath,photo_url,sort) select 'es-'||i,'p-es', case when i<=7 then 'un-es-main' else 'un-es-flat' end,'Room '||i,
 (array['private','ensuite','ensuite','ensuite','private','ensuite','ensuite','shared','shared','ensuite'])[i]::bath_kind,'img/eshcol-room'||i||'.jpg',i from generate_series(1,10) i;
