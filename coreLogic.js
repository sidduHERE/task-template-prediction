const { namespaceWrapper } = require('./namespaceWrapper');
const crypto = require('crypto');
const { TASK_ID, K2_NODE_URL } = require('./init');
const { Connection, LAMPORTS_PER_SOL } = require('@_koi/web3.js');
const fetchTransactions = require('./fetchTransactions');
const fetchData = require('./fetchPrice');
const { object } = require('joi');

class CoreLogic {
  stakePotAccount;
  async task() {
    // Write the logic to do the work required for submitting the values and optionally store the result in levelDB
    const connection = new Connection(K2_NODE_URL);
    const round = await namespaceWrapper.getRound();
    let predictionPayouts = {};
    let state = await namespaceWrapper.getTaskState();
    this.stakePotAccount = state.stakePotAccount;
    const currentTime = Math.floor(Date.now() / 1000);
    const roundedTime = Math.floor(currentTime / 300) * 300;
    console.log(roundedTime, 'roundedTime');
    // TODO: change the arguments from +300 to -300 after testing.
    let transactionResult =
      await fetchTransactions(
        state.stake_pot_account,
        roundedTime - 300,
        roundedTime,
      );
    const transactions = transactionResult[0];
    const openInterestLong = transactionResult[1];
    const openInterestShort = transactionResult[2];
    let { openingPrice, closingPrice } = await fetchData(
      roundedTime - 300,
      roundedTime,
    );
    console.log(transactions, "when seen through core logic");
    if(transactions == null || Object.keys(transactions).length == 0){
      console.log("It went to null");
      return;
    }
    if (openingPrice == null || closingPrice == null) {
      console.log('No data found for this time period');
    } else {
      if (openingPrice > closingPrice) {
        console.log(
          'Opening price is greater than Closing price --> shorts won!!',
        );
        let profit_per_stake = openInterestLong / openInterestShort;
        let stakers = Object.keys(transactions);
        for (let i = 0; i < stakers.length; i++) {
          let staker = stakers[i];
          if (transactions[staker] < 0) {
            let profit = -1 * transactions[staker] * (1 + profit_per_stake);
            console.log('Staker: ', staker, 'Profit: ', profit);
            predictionPayouts[staker] =
              (predictionPayouts[staker] ? predictionPayouts[staker] : 0) +
              profit;
          }
        }
      } else if (closingPrice > openingPrice) {
        console.log(
          'Closing price is greater than Opening price --> longs won!!',
        );
        let profit_per_stake = openInterestShort / openInterestLong;
        let stakers = Object.keys(transactions);
        for (let i = 0; i < stakers.length; i++) {
          let staker = stakers[i];
          if (transactions[staker] > 0) {
            let profit = transactions[staker] * (1 + profit_per_stake);
            console.log('Staker: ', staker, 'Profit: ', profit);
            predictionPayouts[staker] =
              (predictionPayouts[staker] ? predictionPayouts[staker] : 0) +
              profit;
          }
        }
      } else if (closingPrice == openingPrice) {
        console.log('Closing price is equal to Opening price --> no one won!!');
        let stakers = Object.keys(transactions);
        for (let i = 0; i < stakers.length; i++) {
          let staker = stakers[i];
          let stake = transactions[staker];
          if (stake < 0) stake = -1 * stake;
          console.log(
            'Staker: ',
            staker,
            'Returning Amount (Initial Stake Amount): ',
            stake,
          );
          predictionPayouts[staker] =
            (predictionPayouts[staker] ? predictionPayouts[staker] : 0) + stake;
        }
      }

      console.log('predictionPayouts', predictionPayouts);
      await namespaceWrapper.storeSet(
        'predictionPayouts_' + round,
        predictionPayouts,
      );
    }
    // Below is just a sample of work that a task can do

    try {
      const x = Math.random().toString(); // generate random number and convert to string
      const cid = crypto.createHash('sha1').update(x).digest('hex'); // convert to CID
      console.log('HASH:', cid);
      // fetching round number to store work accordingly

      if (cid) {
        await namespaceWrapper.storeSet('cid', cid); // store CID in levelDB
      }
      return cid;
    } catch (err) {
      console.log('ERROR IN EXECUTING TASK', err);
      return 'ERROR IN EXECUTING TASK' + err;
    }
  }
  async fetchSubmission() {
    // Write the logic to fetch the submission values here and return the cid string

    // fetching round number to store work accordingly

    console.log('IN FETCH SUBMISSION');

    // The code below shows how you can fetch your stored value from level DB

    const cid = await namespaceWrapper.storeGet('cid'); // retrieves the cid
    console.log('CID', cid);
    return cid;
  }

  async generateDistributionList(round, _dummyTaskState) {
    try {
      console.log('GenerateDistributionList called');
      console.log('I am selected node');

      // Write the logic to generate the distribution list here by introducing the rules of your choice

      /*  **** SAMPLE LOGIC FOR GENERATING DISTRIBUTION LIST ******/

      let distributionList = {};
      let distributionCandidates = [];
      let taskAccountDataJSON = await namespaceWrapper.getTaskState();
      if (taskAccountDataJSON == null) taskAccountDataJSON = _dummyTaskState;
      const submissions = taskAccountDataJSON.submissions[round];
      const submissions_audit_trigger =
        taskAccountDataJSON.submissions_audit_trigger[round];
      if (submissions == null) {
        console.log('No submisssions found in N-2 round');
        return distributionList;
      } else {
        const keys = Object.keys(submissions);
        const values = Object.values(submissions);
        const size = values.length;
        console.log('Submissions from last round: ', keys, values, size);

        // Logic for slashing the stake of the candidate who has been audited and found to be false
        for (let i = 0; i < size; i++) {
          const candidatePublicKey = keys[i];
          if (
            submissions_audit_trigger &&
            submissions_audit_trigger[candidatePublicKey]
          ) {
            console.log(
              'distributions_audit_trigger votes ',
              submissions_audit_trigger[candidatePublicKey].votes,
            );
            const votes = submissions_audit_trigger[candidatePublicKey].votes;
            if (votes.length === 0) {
              // slash 70% of the stake as still the audit is triggered but no votes are casted
              // Note that the votes are on the basis of the submission value
              // to do so we need to fetch the stakes of the candidate from the task state
              const stake_list = taskAccountDataJSON.stake_list;
              const candidateStake = stake_list[candidatePublicKey];
              const slashedStake = candidateStake * 0.7;
              distributionList[candidatePublicKey] = -slashedStake;
              console.log('Candidate Stake', candidateStake);
            } else {
              let numOfVotes = 0;
              for (let index = 0; index < votes.length; index++) {
                if (votes[index].is_valid) numOfVotes++;
                else numOfVotes--;
              }

              if (numOfVotes < 0) {
                // slash 70% of the stake as the number of false votes are more than the number of true votes
                // Note that the votes are on the basis of the submission value
                // to do so we need to fetch the stakes of the candidate from the task state
                const stake_list = taskAccountDataJSON.stake_list;
                const candidateStake = stake_list[candidatePublicKey];
                const slashedStake = candidateStake * 0.7;
                distributionList[candidatePublicKey] = -slashedStake;
                console.log('Candidate Stake', candidateStake);
              }

              if (numOfVotes > 0) {
                distributionCandidates.push(candidatePublicKey);
              }
            }
          } else {
            distributionCandidates.push(candidatePublicKey);
          }
        }
      }

      // now distribute the rewards based on the valid submissions
      // Here it is assumed that all the nodes doing valid submission gets the same reward

      const reward =
        taskAccountDataJSON.bounty_amount_per_round /
        distributionCandidates.length;
      console.log('REWARD RECEIVED BY EACH NODE', reward);
      for (let i = 0; i < distributionCandidates.length; i++) {
        distributionList[distributionCandidates[i]] = reward;
      }
      console.log("before distribution list", distributionList);
      // const data1 = JSON.parse(distributionList.toString());
      // console.log('data1', data1);
      const predictionList = await namespaceWrapper.storeGet('predictionPayouts_' + round);
      console.log("prediction list", predictionList);
      if(predictionList == null || Object.keys(predictionList).length === 0 ){
        console.log("No prediction payouts found");
        return distributionList;
      }
      const keys = Object.keys(predictionList);
      for (let index = 0; index < keys.length; index++) {
        distributionList[keys[index]] = predictionList[keys[index]] * LAMPORTS_PER_SOL + (distributionList[keys[index]] ? distributionList[keys[index]] : 0);
      }
      console.log(distributionList, "after adding prediction list");
      return distributionList;
    
      // const data2 = JSON.parse(predictionList.toString());
      // console.log('data2', data2);

      // const concatenatedData = { ...data1, ...data2 };

      // const concatenatedJson = JSON.stringify(concatenatedData);
      // console.log('Distribution List concatenated', concatenatedJson);
      // return concatenatedJson;
    } catch (err) {
      console.log('ERROR IN GENERATING DISTRIBUTION LIST', err);
    }
  }

  async submitDistributionList(round) {
    // This function just upload your generated dustribution List and do the transaction for that

    console.log('SubmitDistributionList called');

    try {
      const distributionList = await this.generateDistributionList(round);

      const decider = await namespaceWrapper.uploadDistributionList(
        distributionList,
        round,
      );
      console.log('DECIDER', decider);

      if (decider) {
        const response =
          await namespaceWrapper.distributionListSubmissionOnChain(round);
        console.log('RESPONSE FROM DISTRIBUTION LIST', response);
      }
    } catch (err) {
      console.log('ERROR IN SUBMIT DISTRIBUTION', err);
    }
  }

  async validateNode(submission_value, round) {
    // Write your logic for the validation of submission value here and return a boolean value in response

    // The sample logic can be something like mentioned below to validate the submission

    // try{

    console.log('Received submission_value', submission_value, round);
    // const generatedValue = await namespaceWrapper.storeGet("cid");
    // console.log("GENERATED VALUE", generatedValue);
    // if(generatedValue == submission_value){
    //   return true;
    // }else{
    //   return false;
    // }
    // }catch(err){
    //   console.log("ERROR  IN VALDIATION", err);
    //   return false;
    // }

    // For succesfull flow we return true for now
    return true;
  }

  async shallowEqual(object1, object2) {
    const keys1 = Object.keys(object1);
    const keys2 = Object.keys(object2);
    if (keys1.length !== keys2.length) {
      return false;
    }
    for (let key of keys1) {
      if (object1[key] !== object2[key]) {
        return false;
      }
    }
    return true;
  }

  validateDistribution = async (
    distributionListSubmitter,
    round,
    _dummyDistributionList,
    _dummyTaskState,
  ) => {
    // Write your logic for the validation of submission value here and return a boolean value in response
    // this logic can be same as generation of distribution list function and based on the comparision will final object , decision can be made

    try {
      console.log('Distribution list Submitter', distributionListSubmitter);
      const rawDistributionList = await namespaceWrapper.getDistributionList(
        distributionListSubmitter,
        round,
      );
      let fetchedDistributionList;
      if (rawDistributionList == null) {
        fetchedDistributionList = _dummyDistributionList;
      } else {
        fetchedDistributionList = JSON.parse(rawDistributionList);
      }
      console.log('FETCHED DISTRIBUTION LIST', fetchedDistributionList);
      const generateDistributionList = await this.generateDistributionList(
        round,
        _dummyTaskState,
      );

      // compare distribution list

      const parsed = fetchedDistributionList;
      console.log(
        'compare distribution list',
        parsed,
        generateDistributionList,
      );
      const result = await this.shallowEqual(parsed, generateDistributionList);
      console.log('RESULT', result);
      return result;
    } catch (err) {
      console.log('ERROR IN VALIDATING DISTRIBUTION', err);
      return false;
    }
  };
  // Submit Address with distributioon list to K2
  async submitTask(roundNumber) {
    console.log('submitTask called with round', roundNumber);
    try {
      console.log('inside try');
      console.log(
        await namespaceWrapper.getSlot(),
        'current slot while calling submit',
      );
      const submission = await this.fetchSubmission();
      console.log('SUBMISSION', submission);
      await namespaceWrapper.checkSubmissionAndUpdateRound(
        submission,
        roundNumber,
      );
      console.log('after the submission call');
    } catch (error) {
      console.log('error in submission', error);
    }
  }

  async auditTask(roundNumber) {
    console.log('auditTask called with round', roundNumber);
    console.log(
      await namespaceWrapper.getSlot(),
      'current slot while calling auditTask',
    );
    await namespaceWrapper.validateAndVoteOnNodes(
      this.validateNode,
      roundNumber,
    );
  }

  async auditDistribution(roundNumber) {
    console.log('auditDistribution called with round', roundNumber);
    await namespaceWrapper.validateAndVoteOnDistributionList(
      this.validateDistribution,
      roundNumber,
    );
  }
}
const coreLogic = new CoreLogic();

module.exports = { coreLogic };
