insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('keystone-demo','keystone-demo',false,4194304,array['application/pdf','image/png','image/jpeg','text/plain'])
on conflict(id) do nothing;
