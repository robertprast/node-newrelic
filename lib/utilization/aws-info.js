/*
 * Copyright 2020 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const logger = require('../logger.js').child({ component: 'aws-info' })
const common = require('./common')
const NAMES = require('../metrics/names.js')
let results = null

module.exports = fetchAWSInfo
module.exports.clearCache = function clearAWSCache() {
  results = null
}

function fetchAWSInfo(agent, callback) {
  if (!agent.config.utilization || !agent.config.utilization.detect_aws) {
    return setImmediate(callback, null)
  }

  if (results) {
    return setImmediate(callback, null, results)
  }

  const instanceHost = '169.254.169.254'

  let authToken = ''
  common.metadataAuthToken(
    {
      host: instanceHost,
      path: 'latest/api/token',
      headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
      method: 'PUT'
    },
    agent,
    function setAuthToken(err, data) {
      if (err) {
        return callback(err)
      }
      authToken = data
    }
  )

  common.request(
    {
      host: instanceHost,
      path: 'latest/dynamic/instance-identity/document',
      headers: { 'X-aws-ec2-metadata-token': authToken },
      method: 'GET'
    },
    agent,
    function getMetadata(err, data) {
      if (err) {
        return callback(err)
      }

      try {
        data = JSON.parse(data)
      } catch (e) {
        logger.debug(e, 'Failed to parse AWS metadata.')
        data = null
      }

      results = common.getKeys(data, ['availabilityZone', 'instanceId', 'instanceType'])
      if (results == null) {
        logger.debug('AWS metadata was invalid.')
        agent.metrics.getOrCreateMetric(NAMES.UTILIZATION.AWS_ERROR).incrementCallCount()
      }
      callback(null, results)
    }
  )
}
