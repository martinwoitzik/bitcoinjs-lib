var assert = require('assert')
var bitcoin = require('../../')
var helloblock = require('helloblock-js')({
  network: 'testnet'
})

describe('bitcoinjs-lib (multisig)', function() {
  it('can create a 2-of-3 multisig P2SH address', function() {
    var pubKeys = [
      '026477115981fe981a6918a6297d9803c4dc04f328f22041bedff886bbc2962e01',
      '02c96db2302d19b43d4c69368babace7854cc84eb9e061cde51cfa77ca4a22b8b9',
      '03c6103b3b83e4a24a0e33a4df246ef11772f9992663db0c35759a5e2ebf68d8e9'
    ].map(bitcoin.ECPubKey.fromHex)

    var redeemScript = bitcoin.scripts.multisigOutput(2, pubKeys) // 2 of 3
    var scriptPubKey = bitcoin.scripts.scriptHashOutput(redeemScript.getHash())
    var address = bitcoin.Address.fromOutputScript(scriptPubKey).toString()

    assert.equal(address, '36NUkt6FWUi3LAWBqWRdDmdTWbt91Yvfu7')
  })

  it('can spend from a 2-of-2 multsig P2SH address', function(done) {
    this.timeout(20000)

    var privKeys = [
      '91avARGdfge8E4tZfYLoxeJ5sGBdNJQH4kvjJoQFacbgwmaKkrx',
      '91avARGdfge8E4tZfYLoxeJ5sGBdNJQH4kvjJoQFacbgww7vXtT'
    ].map(bitcoin.ECKey.fromWIF)
    var pubKeys = privKeys.map(function(x) { return x.pub })

    var redeemScript = bitcoin.scripts.multisigOutput(2, pubKeys) // 2 of 2
    var scriptPubKey = bitcoin.scripts.scriptHashOutput(redeemScript.getHash())
    var address = bitcoin.Address.fromOutputScript(scriptPubKey, bitcoin.networks.testnet).toString()

    // Attempt to send funds to the source address
    helloblock.faucet.withdraw(address, 2e4, function(err) {
      if (err) return done(err)

      // get latest unspents from the address
      helloblock.addresses.getUnspents(address, function(err, _, unspents) {
        if (err) return done(err)

        // filter small unspents
        unspents = unspents.filter(function(unspent) { return unspent.value > 1e4 })

        // use the oldest unspent
        var unspent = unspents.pop()

        // make a random destination address
        var targetAddress = bitcoin.ECKey.makeRandom().pub.getAddress(bitcoin.networks.testnet).toString()

        var tx = new bitcoin.Transaction()
        tx.addInput(unspent.txHash, unspent.index)
        tx.addOutput(targetAddress, 1e4)

        // sign w/ each private key
        privKeys.forEach(function(privKey) {
          tx.sign(0, privKey, redeemScript)
        })

        // broadcast our transaction
        helloblock.transactions.propagate(tx.build().toHex(), function(err) {
          if (err) return done(err)

          // check that the funds (1e4 Satoshis) indeed arrived at the intended address
          helloblock.addresses.get(targetAddress, function(err, res, addrInfo) {
            if (err) return done(err)

            assert.equal(addrInfo.balance, 1e4)
            done()
          })
        })
      })
    })
  })
})
