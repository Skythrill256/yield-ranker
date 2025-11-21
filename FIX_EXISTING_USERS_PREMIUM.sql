-- Remove guest role entirely - All users are Premium by default
-- This script removes the guest role and sets all non-admin users to premium

-- Step 1: Check existing constraints on profiles table
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass 
AND contype = 'c';

-- Step 2: Drop ALL possible role check constraints (before updating rows)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check1;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check2;

-- Step 3: Check for any invalid roles first
SELECT role, COUNT(*) as count 
FROM profiles 
WHERE role NOT IN ('admin', 'premium', 'guest', 'user')
GROUP BY role;

-- Step 4: Update the new user trigger FIRST (before updating rows)
-- This ensures any new inserts during the script use 'premium'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role, is_premium)
  VALUES (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'display_name',
    'premium',
    true
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY definer;

-- Step 5: Update all non-admin users to Premium (remove any guest/user roles)
-- Now we can update without constraint violations
-- Handle NULL roles, 'guest', 'user', or any other invalid values
UPDATE profiles 
SET is_premium = true,
    role = 'premium'
WHERE role IS NULL OR (role != 'admin' AND role != 'premium');

-- Step 6: Verify all rows are valid before adding constraint
-- This should return 0 invalid roles
SELECT COUNT(*) as invalid_roles_count
FROM profiles 
WHERE role IS NULL OR role NOT IN ('admin', 'premium');

-- Step 7: Ensure default role is premium
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'premium';
ALTER TABLE profiles ALTER COLUMN is_premium SET DEFAULT true;

-- Step 8: Recreate the constraint WITHOUT 'guest' - only allow 'premium' and 'admin'
-- Only add if all rows are valid (they should be after Step 6)
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('premium', 'admin'));

-- Step 8: Final verification
SELECT 
  COUNT(*) as total_users,
  SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_count,
  SUM(CASE WHEN role = 'premium' THEN 1 ELSE 0 END) as premium_count,
  SUM(CASE WHEN role NOT IN ('admin', 'premium') THEN 1 ELSE 0 END) as invalid_roles
FROM profiles;

-- All users should now be either 'admin' or 'premium' - no guests!

