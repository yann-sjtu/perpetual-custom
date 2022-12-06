pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import {I_Aggregator} from '../../external/chainlink/I_Aggregator.sol';

/**
 * @title Test_ChainlinkAggregator
 * @author dYdX
 *
 * Chainlink Aggregator for testing
 */
/* solium-disable-next-line camelcase */
contract Test_ChainlinkAggregator is I_Aggregator {
    int256 public _ANSWER_ = 0;

    // ============ Test Data Setter Functions ============

    function setAnswer(int256 newAnswer) external {
        _ANSWER_ = newAnswer;
    }

    // ============ Getter Functions ============

    function latestAnswer() external view returns (int256) {
        return _ANSWER_;
    }
}
