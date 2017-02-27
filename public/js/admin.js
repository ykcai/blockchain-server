console.log("here1");
$(document).ready(function() {

    $('#submit_button').click(function () {
        console.log("submitting admin commands");
        var username = $("#username").val();
        var password = $("#password").val();

        var add_to_all_users = $('#add_to_all_users').is(':checked');
        var add_to_managers =  $('#add_to_managers').is(':checked');
        var add_to_specific_user =  $('#add_to_specific_user').is(':checked');

        var num_coins = $("#num_coins").val();
        var reciever_email = $("#reciever_email").val();

        console.log("add_to_all_users: " + add_to_all_users);
        console.log("add_to_managers: " + add_to_managers);
        console.log("add_to_specific_user: " + add_to_specific_user);
        console.log("num_coins: " + num_coins);
        console.log("reciever_email: " + reciever_email);

        if(!username || !password){
            alert("Admin Email And Password Field Cannot be Empty")
            return;
        }

        if(!num_coins){
            alert("Please Indicate Number of Coins")
            return;
        }

        if(!reciever_email && add_to_specific_user){
            alert("Please Indicate The User's Email Who Will Get the Points")
            return;
        }

        var jsonData = {
            email:username,
            password:password,
            to_all:add_to_all_users,
            to_managers:add_to_managers,
            to_user:add_to_specific_user,
            coins:num_coins,
            reciever_email:reciever_email
        }

        $.ajax({
           url: '/admin/send_coins',
           type: 'POST',
           cache: false,
           data: jsonData,
           success: function(data){
               if(!data.success){
                   alert(data.error);
                   return;
               }else{
                   alert('Success! ' + data.msg )
                   return;
               }
           }
           , error: function(jqXHR, textStatus, err){
               alert('text status '+textStatus+', err '+err)
           }
        })
     });


     $('#get_user').click(function () {
         console.log("in Get User Button");
        var useremail = $("#user_email_get").val();
        if(!useremail){
            alert("Enter a User's Email")
            return
        }


        $.ajax({
           url: '/slack/user',
           type: 'GET',
           cache: false,
           headers: { 'username': useremail },
           data: {username:useremail},
           success: function(data){
               if(!data){
                   alert("Something Went Wrong");
                   return;
               }else if(data.msg && data.msg == "Error - Data not found for some reason?"){
                   alert('User Was Not Found! ' )
                   return;
               }else{
                   data = JSON.parse(data);

                   console.log("data: " + JSON.stringify(data));
                   console.log("data.id: " + data.id);
                   console.log("data.giveBalance: " + data.giveBalance);
                   console.log("data.pointsBalance: " + data.pointsBalance);

                   $("#user_spendings").text(data.giveBalance + " Coins");
                   $("#user_savings").text(data.pointsBalance + " Coins");
               }
           }
           , error: function(jqXHR, textStatus, err){
               alert('text status '+textStatus+', err '+err)
           }
        })


     });







})
