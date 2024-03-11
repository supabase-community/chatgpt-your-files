alter table document_sections
drop constraint document_sections_document_id_fkey,
add constraint document_sections_document_id_fkey
   foreign key (document_id)
   references documents(id)
   on delete cascade;
