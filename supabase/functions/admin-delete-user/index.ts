import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { userId } = await req.json()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role key for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Create regular client to get current user
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Get current authenticated user
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !currentUser) {
      console.error('Authentication error:', authError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get current user's profile to check role and business
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role, business_id')
      .eq('user_id', currentUser.id)
      .single()

    if (profileError || !currentProfile) {
      console.error('Profile error:', profileError)
      return new Response(
        JSON.stringify({ error: 'Unable to verify user permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if current user is admin
    if (currentProfile.role !== 'admin') {
      console.error('User is not admin:', currentUser.id)
      return new Response(
        JSON.stringify({ error: 'Only admins can delete users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Prevent self-deletion
    if (userId === currentUser.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot delete your own account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get target user's profile to verify they're in the same business
    const { data: targetProfile, error: targetProfileError } = await supabase
      .from('profiles')
      .select('business_id')
      .eq('user_id', userId)
      .single()

    if (targetProfileError || !targetProfile) {
      console.error('Target profile error:', targetProfileError)
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if both users are in the same business
    if (targetProfile.business_id !== currentProfile.business_id) {
      console.error('Business mismatch:', { target: targetProfile.business_id, current: currentProfile.business_id })
      return new Response(
        JSON.stringify({ error: 'Can only delete users from your own business' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Delete the user's profile first (this will cascade and clean up related data)
    const { error: deleteProfileError } = await supabase
      .from('profiles')
      .delete()
      .eq('user_id', userId)

    if (deleteProfileError) {
      console.error('Error deleting profile:', deleteProfileError)
      return new Response(
        JSON.stringify({ error: 'Failed to delete user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Delete the user from auth using admin client
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteAuthError) {
      console.error('Error deleting auth user:', deleteAuthError)
      return new Response(
        JSON.stringify({ error: 'Failed to delete user authentication' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Successfully deleted user:', userId)
    
    return new Response(
      JSON.stringify({ success: true, message: 'User deleted successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error in admin-delete-user:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})