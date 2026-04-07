-- Supabase validation: check required tables and columns
-- Run in Supabase SQL editor

with required_tables as (
  select unnest(array[
    'user_credits',
    'business_profiles',
    'business_materials',
    'generated_posts',
    'generated_images',
    'generated_logos',
    'chat_conversations',
    'chat_messages'
  ]) as table_name
)
select
  rt.table_name,
  case when t.table_name is null then 'MISSING' else 'OK' end as status
from required_tables rt
left join information_schema.tables t
  on t.table_schema = 'public'
 and t.table_name = rt.table_name
order by rt.table_name;

-- Optional: quick column check for business_profiles
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'business_profiles'
order by ordinal_position;
