 3. To add more admins in the future:
    - Have them sign up at /admin/signup
    - Query their user_id: SELECT id, email FROM auth.users WHERE email = 
  'their-email';
    - Insert into admins: INSERT INTO admins (user_id) VALUES 
  ('their-user-id');