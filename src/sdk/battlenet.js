import Promise from 'bluebird'
import fetchJsonp from 'fetch-jsonp'

import { getHashValue, getQueryStringValue, parseAsURL, rslError } from '../utils'

const BATTLENET_API = 'https://us.battle.net'

let battlenetAuth
let battlenetAccessToken

/**
 * @param {string} appId
 * @param {string} redirect
 * @param {array|string} scope
 * Fake Battlenet SDK loading (needed to trick RSL into thinking its loaded).
 */
const load = ({ appId, redirect, scope }) => new Promise((resolve, reject) => {
  const _redirect = parseAsURL(redirect)
  const searchParams = 'rslCallback=battlenet'
  let battlenetScopes = [ ]

  if (Array.isArray(scope)) {
    battlenetScopes = battlenetScopes.concat(scope)
  } else if (typeof scope === 'string' && scope) {
    battlenetScopes = battlenetScopes.concat(scope.split(','))
  }

  battlenetScopes = battlenetScopes.reduce((acc, item) => {
    if (typeof item === 'string' && acc.indexOf(item) === -1) {
      acc.push(item.trim())
    }

    return acc
  }, []).join('+')

  _redirect.search = _redirect.search ? _redirect.search + '&' + searchParams : '?' + searchParams

  battlenetAuth = `https://us.battle.net/oauth/authorize?client_id=${appId}&scope=${battlenetScopes}&redirect_uri=${encodeURIComponent(_redirect.toString())}&response_type=code`

  if (getQueryStringValue('rslCallback') === 'battlenet') {
    if (getQueryStringValue('error')) {
      return reject(rslError({
        provider: 'battlenet',
        type: 'auth',
        description: 'Authentication failed',
        error: {
          error_reason: getQueryStringValue('error_reason'),
          error_description: getQueryStringValue('error_description')
        }
      }))
    } else {
      battlenetAccessToken = getHashValue('access_token')
    }
  }

  return resolve(battlenetAccessToken)
})

/**
 * Checks if user is logged in to app through Battlenet.
 * @see https://www.battlenet.com/developer/endpoints/users/#get_users_self
 */
const checkLogin = (autoLogin = false) => {
  if (autoLogin) {
    return login()
  }

  if (!battlenetAccessToken) {
    return Promise.reject(rslError({
      provider: 'battlenet',
      type: 'access_token',
      description: 'No access token available',
      error: null
    }))
  }

  return new Promise((resolve, reject) => {
    fetchJsonp(`${BATTLENET_API}/oauth/userinfo/?access_token=${battlenetAccessToken}`)
      .then((response) => response.json())
      .then((json) => {
        if (json.meta.code !== 200) {
          return reject(rslError({
            provider: 'battlenet',
            type: 'check_login',
            description: 'Failed to fetch user data',
            error: json.meta
          }))
        }

        return resolve({ data: json.data, accessToken: battlenetAccessToken })
      })
      .catch((err) => reject({ // eslint-disable-line prefer-promise-reject-errors
        fetchErr: true,
        err: rslError({
          provider: 'battlenet',
          type: 'check_login',
          description: 'Failed to fetch user data due to fetch error',
          error: err
        })
      }))
  })
}

/**
 * Trigger Battlenet login process.
 * This code only triggers login request, response is handled by a callback handled on SDK load.
 * @see https://www.battlenet.com/developer/authentication/
 */
const login = () => new Promise((resolve, reject) => {
  checkLogin()
    .then((response) => resolve(response))
    .catch((err) => {
      if (!err.fetchErr) {
        window.open(battlenetAuth, '_self')
      } else {
        return reject(err.err)
      }
    })
})

/**
 * Fake Battlenet logout.
 */
const logout = () => new Promise((resolve) => {
  battlenetAccessToken = undefined

  return resolve()
})

/**
 * Helper to generate user account data.
 * @param {Object} data
 * @see About token expiration: https://www.battlenet.com/developer/authentication/
 * @see Battlenet API doesn’t provide email: https://www.battlenet.com/developer/endpoints/users/#get_users_self
 */
const generateUser = (data) => ({
  profile: {
    id: data.data.id,
    name: data.data.battletag
  },
  token: {
    accessToken: data.access_token,
    expiresAt: data.expires_in
  }
})

export default {
  checkLogin,
  generateUser,
  load,
  login,
  logout
}
