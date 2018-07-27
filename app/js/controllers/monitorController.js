'use strict'
angular.module('myApp.monitor')
    .controller('MonitorCtrl', function ($http, $scope, VesselProcessService, $interval, Session, $filter) {
        //Init Map
        initMap();
        var portMarkers = []; //港口点标记集合，Marker类集合

        $scope.displayPort = function (pname, portImg) {
            var params = {
                params: {
                    name: pname
                }
            }
            console.log(params);
            $http.get(vesselA_server + "api/location", params)
                .success(function (data) {
                    console.log("load valid ports: ", data);
                    portMarkers.push(new AMap.Marker({
                        map: map,
                        icon: portImg,
                        position: new AMap.LngLat(data.longitude, data.latitude),
                        title: data.name
                    }));
                })
        }

        /**
         * Start Vessel process
         */
        $scope.vid = '413362260';  //船的id
        $scope.sailor = 'admin';    //操作员
        $scope.startVessel = function () {
            var params = {
                sailor: $scope.sailor,
                vid: $scope.vid,
                defaultDelayHour: defaultDelayHour,
                zoomInVal: zoomInVal
            };

            $http.post(vesselA_server + "api/process-instances/vessel-process", params)
                .success(function (data) {
                    console.log("Start Vessel process ...", data);
                    //TODO:船启动后，才添加港口
                });
        };

        /**
         * cost display
         */
        $scope.currentCost = 0.00;  //当前成本
        $scope.initialCost = 0.00; //初始成本
        $scope.eventType = null;
        $scope.C0 = 0.00; //变化前，前往上一次决策的目标港口的预计总成本
        $scope.C1 = 0.00; //变化后，前往上一次决策的目标港口的预计总成本: C1 = C0 +　仓储费变化
        $scope.C2 = 0.00; //决策后，前往新的目标港口的预计总成本
        $scope.C1C0 = '';
        $scope.C2C0 = '';
        $scope.C2C1 = '';
        $scope.policy = null;
        $scope.riskCost = 0.00;
        $scope.totalCost = 0.00;
        $('#riskCost').css({color:"green"});
        $('#addRiskCost').css({color:"green"});
        $scope.costRatePanelShow = false;

        AMapUI.load(['ui/misc/PathSimplifier'], function (PathSimplifier) {

                if (!PathSimplifier.supportCanvas) {
                    alert('当前环境不支持 Canvas！');
                    return;
                }


                /**
                 * **************************************************************************************************
                 * TODO : some logics associated with vessel and vessel
                 * ************************************************************************************************
                 */



                $scope.vesselShadows = new Map();         //vessel shadow
                $scope.vHttpUrl = vesselA_server + 'api/sps';
                $scope.vSocket = new SockJS($scope.vHttpUrl);
                $scope.vesselStompClient = Stomp.over($scope.vSocket);
                $scope.vmarker = null;
                $scope.onVAConnected = function () {
                    console.log("Connect to vessel-A successfully : ");
                    $scope.vesselStompClient.subscribe("/user/queue/greetings1", $scope.onMessageReceived);
                    $scope.vesselStompClient.send("/app/hello1", {}, JSON.stringify({'name': 'Stomp over WebSocket with authenticated'}));
                    $scope.vesselStompClient.subscribe("/user/topic/vesselShadow", $scope.onUpdateVesselShadow);
                    $scope.vesselStompClient.subscribe("/user/topic/ports", $scope.onDisplayPorts);
                    $scope.vesselStompClient.subscribe("/user/topic/dock/end", $scope.onDockEnd);
                    $scope.vesselStompClient.subscribe("/user/topic/voyage/end", $scope.onVoyaEnd);
                    $scope.vesselStompClient.subscribe("/user/topic/missing", $scope.onMissing);
                    $scope.vesselStompClient.subscribe("/user/topic/meeting", $scope.onMeeting);
                    $scope.vesselStompClient.subscribe("/user/topic/vessel/delay", $scope.onDelayMsg);


                };
                $scope.vesselStompClient.connect({}, $scope.onVAConnected, $scope.onVAError);

                $scope.onVAError = function (error) {

                    console.log(error);
                };
                $scope.onDelayMsg = function (frame) {
                    var msg = JSON.parse(frame.body).message;
                    $.toaster(msg, 'IoT-Ship', 'warning');
                }

                $scope.onMessageReceived = function (payload) {
                    console.log("greetings form activiti :", payload);
                }
                $scope.onDisplayPorts = function (frame) {
                    var destinations = JSON.parse(frame.body).destinations;
                    for (let i = 0; i < destinations.length; i++) {
                        $scope.displayPort(destinations[i].name, port32);
                    }
                }
                $scope.onMeeting = function (frame) {
                    $.toaster("Successful delivery of spare parts.", 'LVC', 'success');
                }
                $scope.onMissing = function (frame) {
                    $.toaster("Missing the delivery opportunity and the spare parts delivery failed.", 'LVC', 'error');
                }
                $scope.onVoyaEnd = function (frame) {
                    var payload = JSON.parse(frame.body);
                    var port = payload.port;
                    $.toaster("Current Port : " + port.name + " Estimated Departure Time : " + port.estiDepartureTime, 'IoT-Ship');
                }

                $scope.onDockEnd = function (frame) {
                    var payload = JSON.parse(frame.body);
                    $scope.displayPort(payload.port.name, uselessPort32);
                    var nextPort = payload.nextPort;
                    $.toaster("Next Port : " + nextPort.name + " Estimated Arrival Time : " + nextPort.estiArrivalTime, 'IoT-Ship');
                }

                $scope.clearPortMarkers = function (portMarkers) {
                    portMarkers.forEach(function (portMarker, idx, portMarkers) {
                        if (portMarker != null) {
                            portMarker.hide()
                        }
                    })
                }
                $scope.onUpdateVesselShadow = function (frame) {
                    var vesselShadow = JSON.parse(frame.body).vesselShadow;

                    // console.log("Received vessel shadow : ", vesselShadow);
                    var frameData = JSON.parse(frame.body);
                    $scope.vesselShadows.set(vesselShadow.id, vesselShadow);
                    if ($scope.vmarker != null) {
                        $scope.vmarker.hide();
                    }
                    $scope.vmarker = new AMap.Marker({ // 加点
                        map: map,
                        position: [vesselShadow.longitude, vesselShadow.latitude],
                        icon: new AMap.Icon({ // 复杂图标
                            size: new AMap.Size(64, 64), // 图标大小
                            image: "images/vessel.png",// 大图地址
                        })
                    });
                }


                /**
                 * ABOUT WEAGON LOGIC AS FOLLOWING
                 */
                $scope.wagonShadows = new Map();         //vessel shadow
                console.log("attempt to create logistic stomp client...");
                $scope.logAhttpUrl = logisticA_server + 'api/sps';
                $scope.logASocket = new SockJS($scope.logAhttpUrl);
                $scope.logAStompClient = Stomp.over($scope.logASocket);
                $scope.logAmarker = null;
                $scope.onWConnected = function () {
                    console.log("Connect to logistic-A successfully : ");
                    $scope.logAStompClient.subscribe("/user/topic/route/success", $scope.onRouteSuccess);
                    $scope.logAStompClient.subscribe("/user/topic/route/fail", $scope.onRouteFail);
                    $scope.logAStompClient.subscribe("/user/topic/route/missing", $scope.onRouteMissing);
                    $scope.logAStompClient.subscribe("/user/topic/wagon/pause", $scope.onReplan);

                    // $scope.logAStompClient.send("/app/testPath", {}, JSON.stringify({'name': 'Stomp over WebSocket with authenticated'}));

                };
                $scope.onWError = function () {
                    console.log("wagon websocket failed");
                }

                $scope.logAStompClient.connect({}, $scope.onWConnected, $scope.onWError);
                //定义wagon仿真器
                var wagon = {
                    destination: null,
                    pathData: null,
                    path: null,
                    pathSimplifierIns: {},
                    stepSimplifierIns: {},
                    movedSimplifierIns: {},
                    navigator: null,
                    movedPathData: [],
                    movedDistance: 0,
                    storageRate: 0,
                    timeout: 0,
                    threshold: 0,
                    idx: 0,
                    navTimer: {},
                    extendTimer: {},
                    deltaNavDist: 0,
                    deltaNavCost: 0,
                }

                $scope.onReplan = function (frame) {
                    console.log(JSON.parse(frame.body));
                    wagon.movedPathData = wagon.movedPathData.concat(wagon.path.steps[wagon.idx].polyline.slice(0, wagon.navigator.getCursor().idx))
                    wagon.movedSimplifierIns.setData([{
                        named: "已走过路段",
                        path: wagon.movedPathData
                    }])
                    if (wagon.navTimer !== null) {
                        $interval.cancel(wagon.navTimer);
                    }
                    if (wagon.extendTimer !== null) {
                        $interval.cancel(wagon.extendTimer);
                    }
                    wagon.pathSimplifierIns.setData();
                    wagon.stepSimplifierIns.clearPathNavigators();
                    wagon.deltaNavDist = 0;
                }
                $scope.onRouteMissing = function (frame) {
                    $.toaster('Missing the delivery opportunity and the spare parts delivery failed.', 'LVC', 'danger');
                    // $interval.cancel(setCurrentCost);
                    var frameData = JSON.parse(frame.body);
                    if (wagon.navTimer !== null) {
                        $interval.cancel(wagon.navTimer);
                    }
                    $scope.costRatePanelShow = true;
                    $scope.policy = frameData.policy;
                    $scope.eventType = frameData.reason;
                    if ($scope.policy == 'fixed-destination') {
                        $scope.totalCost = parseFloat((frameData.totalCost).toFixed(2));
                        $scope.riskCost = parseFloat((frameData.riskCost).toFixed(2));
                        $scope.initialCost = ($scope.totalCost + $scope.riskCost).toFixed(2);
                        if ($scope.riskCost == 0) {
                            $scope.addRiskCost = $scope.riskCost;
                            $('#riskCost').css({color: "green"});
                            $('#addRiskCost').css({color: "green"});
                        } else {
                            $scope.addRiskCost = $scope.riskCost + ' ↑42%';
                            $('#riskCost').css({color: "red"});
                            $('#addRiskCost').css({color: "red"});
                        }
                        $scope.currentCost = $scope.initialCost;
                    } else if ($scope.policy == 'variable-destination') {
                        var isFirst = frameData.isFirst;
                        if (isFirst == true) {
                            $scope.initialCost = '∞';
                            $scope.costRatePanelShow = false;
                        } else {
                            $scope.costRatePanelShow = true;
                            $scope.C1 = '∞';
                            $scope.C2 = '∞';
                            $('#C1C0').css({color: "black"});
                            $('#C2C0').css({color: "black"});
                            $('#C2C1').css({color: "black"});
                            $scope.event = '此次配送失败';
                            if ($scope.C0 === -1) {
                                $scope.C1C0 = 'No delivery opportunity';
                                $scope.C2C0 = 'No delivery opportunity';
                                $scope.C2C1 = 'No delivery opportunity';
                            } else {
                                $scope.C1C0 = 'Losing delivery opportunities';
                                $scope.C2C0 = 'Losing delivery opportunities';
                                $scope.C2C1 = 'No delivery opportunity';
                            }
                        }

                        wagon.stepSimplifierIns.clearPathNavigators();
                        wagon.pathSimplifierIns.setData();
                    }


                }
                $scope.onRouteFail = function (frame) {
                    console.log("fail", JSON.parse(frame.body));
                    var frameData = JSON.parse(frame.body);
                    var isFirst = frameData.isFirst;
                    /*********************display Cost*******-1 代表无穷 , Fail , //-3 代表无穷 , Missing************/
                    if (isFirst === true) {//如果是第一次，不展示效益对比图
                        $scope.initialCost = '∞';
                        $scope.costRatePanelShow = false;
                    } else {
                        $scope.costRatePanelShow = true;
                        $scope.C1 = '∞';
                        $scope.C2 = '∞';
                        $('#C1C0').css({color: "black"});
                        $('#C2C0').css({color: "black"});
                        $('#C2C1').css({color: "black"});
                        $scope.event = '当前变化无配送机会';
                        if ($scope.C0 === -1) {
                            $scope.C1C0 = 'No delivery opportunity';
                            $scope.C2C0 = 'No delivery opportunity';
                            $scope.C2C1 = 'No delivery opportunity';
                        } else {
                            $scope.C1C0 = 'Losing delivery opportunities';
                            $scope.C2C0 = 'Losing delivery opportunities';
                            $scope.C2C1 = 'No delivery opportunity';
                        }
                    }
                    if (wagon.navTimer !== null) {
                        $interval.cancel(wagon.navTimer);
                    }
                    wagon.stepSimplifierIns.clearPathNavigators();
                    wagon.pathSimplifierIns.setData();
                    $.toaster('No suitable rendezvous port found', 'LVC', 'warning')
                }

                /**
                 *
                 * @param frame
                 */
                $scope.onRouteSuccess = function (frame) {

                    var frameData = JSON.parse(frame.body);
                    var pid = frameData.from;
                    var rendezvous = frameData.rendezvous;
                    $scope.costRatePanelShow = true;
                    $scope.policy = frameData.policy;
                    $scope.eventType = frameData.reason;
                    if ($scope.policy == 'fixed-destination') {
                        $scope.totalCost = parseFloat((frameData.totalCost).toFixed(2));
                        $scope.riskCost = parseFloat((frameData.riskCost).toFixed(2));
                        $scope.initialCost = $scope.totalCost + $scope.riskCost;
                        console.log($scope.initialCost + "color risk" + $scope.riskCost);
                        if ($scope.riskCost == 0.00) {
                            $scope.addRiskCost = $scope.riskCost + '';
                            $('#riskCost').css({color: "green"});
                            $('#addRiskCost').css({color: "green"});
                            console.log("color risk");
                        } else {
                            $scope.addRiskCost = $scope.riskCost + ' ↑42%';
                            $('#riskCost').css({color: "red"});
                            $('#addRiskCost').css({color: "red"});
                        }
                    } else if ($scope.policy == 'variable-destination') {

                        /*********************display Cost*******-1 代表无穷 , Fail , //-3 代表无穷 , Missing************/
                        $scope.C0 = frameData.C0;
                        $scope.C1 = frameData.C1;
                        $scope.C2 = frameData.C2;
                        var isFirst = frameData.isFirst;
                        if (isFirst == true) {//如果是第一次，不展示效益对比图
                            $scope.initialCost = ($scope.C2).toFixed(2);
                            $scope.C0 = $scope.initialCost;
                            $scope.C1 = $scope.initialCost;
                            $scope.C2 = $scope.initialCost;
                            $('#C1C0').css({color: "black"});
                            $('#C2C1').css({color: "black"});
                            $('#C2C0').css({color: "black"});
                            $scope.C1C0 = 0;
                            $scope.C2C1 = 0;
                            $scope.C2C0 = 0;
                        } else {
                            $scope.C2 = parseFloat(($scope.C2).toFixed(2));
                            if ($scope.C0 == -1) {//last plan failed.
                                $scope.C0 = '∞';
                                $scope.C1 = '∞';
                                $scope.C2 = ($scope.C2).toFixed(2);
                                $('#C1C0').css({color: "black"});
                                $('#C2C0').css({color: "green"});
                                $('#C2C1').css({color: "green"});
                                $scope.C2C1 = 'Seized the delivery opportunity';
                                $scope.C1C0 = 'Seized the delivery opportunity';
                                $scope.C2C0 = 'Seized the delivery opportunity';
                            } else {//last plan succeed.
                                $scope.C0 = parseFloat(($scope.C0).toFixed(2));
                                if($scope.C1 == -1){//After change , last destination is unreachable.
                                    $scope.C1 = '∞';
                                    $scope.C1C0 = '∞';
                                    $('#C1C0').css({color: "red"});
                                    $scope.C2C0 = ((1 - ($scope.C2 / $scope.C0)) * 100).toFixed(2);
                                    if ($scope.C2C0 < 0) {//决策后，相对于上一次的决策成本增加
                                        $('#C2C0').css({color: "red"});
                                        $scope.C2C0 = '↑' + (-$scope.C2C0) + '%';
                                    } else {//决策后，相对于上一次的决策成本减少
                                        $('#C2C0').css({color: "green"});
                                        $scope.C2C0 = '↓' + $scope.C2C0 + '%';
                                    }
                                    $('#C2C1').css({color: "green"});
                                    $scope.C2C1 = '100%'
                                }else{//After change , last destination is still reachable.
                                    $scope.C1 = parseFloat(($scope.C1).toFixed(2));
                                    $scope.C1C0 = ((1 - ($scope.C1 / $scope.C0)) * 100).toFixed(2);
                                    if ($scope.C1C0 < 0) {//before decision-making and after change , cost increased.
                                        $('#C1C0').css({color: "red"});
                                        $scope.C1C0 = '↑' + (-$scope.C1C0) + '%';
                                    } else {//before decision-making and after change , cost reduced.
                                        $('#C1C0').css({color: "green"});
                                        $scope.C1C0 = '↓' + $scope.C1C0 + '%';
                                    }
                                    $scope.C2C0 = ((1 - ($scope.C2 / $scope.C0)) * 100).toFixed(2);
                                    if ($scope.C2C0 < 0) {//决策后，相对于上一次的决策成本增加
                                        $('#C2C0').css({color: "red"});
                                        $scope.C2C0 = '↑' + (-$scope.C2C0) + '%';
                                    } else {//决策后，相对于上一次的决策成本减少
                                        $('#C2C0').css({color: "green"});
                                        $scope.C2C0 = '↓' + $scope.C2C0 + '%';
                                    }
                                    $scope.C2C1 = ((1 - ($scope.C2 / $scope.C1)) * 100).toFixed(2);
                                    if ($scope.C2C1 < 0) {//决策后，相对于变化后成本增加
                                        $('#C2C1').css({color: "red"});
                                        $scope.C2C1 = '↑' + (-$scope.C2C1) + '%';
                                    } else {//决策后，相对于变化后成本减少
                                        $('#C2C1').css({color: "green"});
                                        $scope.C2C1 = '↓' + $scope.C2C1 + '%';
                                    }
                                }

                            }
                        }
                    } else {
                        console.log("unsupported policy.");
                    }


                    /********************Route***********************/

                    var path = rendezvous.route;
                    var pathData = [];
                    for (var i = 0; i < path.steps.length; i++) {
                        var polyline = path.steps[i].polyline;
                        path.steps[i].polyline = [];
                        for (var j = 0; j < polyline.length; j++) {
                            var polyArr = [polyline[j].longitude, polyline[j].latitude];
                            path.steps[i].polyline.push(polyArr);
                            pathData.push(polyArr);
                        }
                    }

                    wagon.destination = rendezvous.name;
                    wagon.path = path;
                    wagon.pathData = pathData;
                    wagon.threshold = rendezvous.trafficThreshold;
                    wagon.idx = 0;
                    wagon.timeout = 0;

                    console.log("wagon ", wagon);
                    wagon.pathSimplifierIns = createPathSimplifierIns(PathSimplifier);
                    wagon.pathSimplifierIns.setData([{ // 展示总路线
                        name: '总路线',
                        path: wagon.pathData
                    }]);

                    var navData = [{
                        name: "路段" + wagon.idx,
                        path: wagon.path.steps[wagon.idx].polyline.slice(0)
                    }];
                    wagon.movedPathData.concat(wagon.path.steps[wagon.idx].polyline.slice(0));
                    wagon.movedSimplifierIns = createPathSimplifierIns(PathSimplifier);
                    wagon.movedSimplifierIns.getRenderOptions().pathLineStyle.strokeStyle = 'blue';
                    console.log("movedPath", wagon.movedPathData)
                    wagon.stepSimplifierIns = createPathSimplifierIns(PathSimplifier); //分段导航
                    wagon.stepSimplifierIns.setData(navData);
                    var stepDistance = wagon.path.steps[wagon.idx].distance;
                    var stepDuration = wagon.path.steps[wagon.idx].duration;
                    var speed = stepDistance / stepDuration * 3.6 * zoomInVal;
                    wagon.navigator = createNavigator(PathSimplifier, wagon.stepSimplifierIns, 0, speed);
                    wagon.navigator.start();
                    $.toaster('Wagon navigation begins!, destination：' + wagon.destination, 'IoT-Wagon', 'success');

                    wagon.navTimer = $interval(function () {
                        var position = wagon.navigator.getPosition();
                        var requestBody = {
                            longitude: position.getLng(),
                            latitude: position.getLat(),
                            speed: wagon.navigator.getSpeed() / zoomInVal,
                            movedDistance: wagon.navigator.getMovedDistance() + wagon.movedDistance,
                            deltaNavDist: wagon.navigator.getMovedDistance() + wagon.deltaNavDist
                        }
                        // wagon.currentCost = wagon.freightRate*wagon.
                        console.log("upload request body :", requestBody);
                        //TODO : upload to wagon shadow
                        $http.post(logisticA_server + 'api/' + pid + '/shadow', requestBody)
                            .success(function (data) {
                                console.log("upload to wagon shadow : ", data);
                                $scope.currentCost = data.lastNavsCost + data.deltaNavCost;
                                $scope.currentCost = ($scope.currentCost).toFixed(2);
                            });
                    }, 1000)

                    wagon.extendTimer = $interval(function () {
                        var status = doExpand(wagon);
                        switch (status) {
                            case 'TRAFFIC' :
                                wagon.stepSimplifierIns.clearPathNavigators(); // stop navigator
                                $.toaster('Re-planning the path due to congestion.', 'LVC', 'warning');
                                $http.post(logisticA_server + 'api/' + pid + '/traffic', {msgType: "traffic"})
                                    .success(function (data) {
                                        console.log("重新执行规划");
                                        $interval.cancel(wagon.navTimer);
                                    });
                                break;
                            case 'ARRIVAL' :
                                $interval.cancel(wagon.navTimer);
                                $interval.cancel(wagon.extendTimer);
                                $http.post(logisticA_server + 'api/' + pid + '/arrival', {msgType: "Arrival"})
                                    .success(function (data) {
                                        if(policy == 'fixed-destination'){
                                            $scope.currentCost = $scope.initialCost;
                                        }else if(policy == 'variable-destination'){
                                            $scope.currentCost = ($scope.C2).toFixed(2);

                                        }
                                        $.toaster("Wagon arrives at the rendezvous port." + wagon.destination, 'IoT-Wagon', 'success');
                                    });
                                break;
                            case 'NEXT_STEP' :
                                wagon.movedDistance += wagon.path.steps[wagon.idx - 1].distance;
                                wagon.deltaNavDist += wagon.path.steps[wagon.idx - 1].distance;

                                wagon.movedPathData = wagon.movedPathData.concat(wagon.path.steps[wagon.idx - 1].polyline);
                                wagon.movedSimplifierIns.setData([{
                                    named: "已走过路段",
                                    path: wagon.movedPathData
                                }])
                                // console.log("movedPath" , wagon.movedPathData)

                                wagon.stepSimplifierIns.setData([{
                                    name: '路段' + wagon.idx,
                                    path: wagon.path.steps[wagon.idx].polyline
                                }]); //延展路径
                                //重新建立一个巡航器
                                var stepDistance = wagon.path.steps[wagon.idx].distance;
                                var stepDuration = wagon.path.steps[wagon.idx].duration;
                                var speed = stepDistance / stepDuration * 3.6 * zoomInVal;
                                wagon.navigator = createNavigator(PathSimplifier, wagon.stepSimplifierIns, 0, speed);
                                wagon.navigator.start();
                                break;
                            default :
                                break;
                        }

                    }, 1000);

                }

                /**
                 * ABOUT MSC LOGIC AS FOLLOWING
                 */
                console.log("attempt to create msc stomp client...");
                $scope.mscHttpUrl = msc_server + 'sps';
                $scope.mscSocket = new SockJS($scope.mscHttpUrl);
                $scope.mscStompClient = Stomp.over($scope.mscSocket);
                $scope.supplierMarker = null;
                $scope.onMSCConnected = function () {
                    console.log("Connect to msc successfully : ");
                    $scope.mscStompClient.subscribe("/topic/destinations/invalid", $scope.onInValid);
                    $scope.mscStompClient.subscribe("/topic/supplier/location", $scope.onInShowSupplier);

                };
                $scope.onMSCError = function () {
                    console.log("MSC websocket failed");
                }
                $scope.mscStompClient.connect({}, $scope.onMSCConnected, $scope.onMSCError);
                $scope.onInValid = function (frame) {
                    console.log(JSON.parse(frame.body));
                    var ports = JSON.parse(frame.body).invalidDestinations;
                    console.log("ports", ports);
                    //TODO:船启动后，才添加港口
                    $.toaster("Some ports don't meet the weight limit condition.", 'MSC', 'warning');
                    for (let i = 0; i < ports.length; i++) {
                        $scope.displayPort(ports[i], uselessPort32);
                    }
                }

                $scope.onInShowSupplier = function (frame) {
                    var loc = JSON.parse(frame.body).location;
                    $.toaster("Specify the appropriate spare parts supplier", 'MSC');
                    $scope.supplierMarker = setSupplier('Supplier Company', new AMap.LngLat(loc.longitude, loc.latitude))
                }


                /**
                 * ABOUT VMC LOGIC AS FOLLOWING
                 */
                console.log("attempt to create vmc stomp client...");
                $scope.vmcHttpUrl = vmc_server + 'sps';
                $scope.vmcSocket = new SockJS($scope.vmcHttpUrl);
                $scope.vmcStompClient = Stomp.over($scope.vmcSocket);
                $scope.managerMarker = null;
                $scope.onVMCConnected = function () {
                    console.log("Connect to vmc successfully : ");
                    $scope.vmcStompClient.subscribe("/topic/manager/location", $scope.onShowManager);
                }
                $scope.onVMCError = function () {
                    console.log("Fail to connect to vmc: ");
                }
                $scope.vmcStompClient.connect({}, $scope.onVMCConnected, $scope.onVMCError);


                $scope.onShowManager = function (frame) {
                    var loc = JSON.parse(frame.body).location;
                    console.log("manager loc", [loc.longitude, loc.latitude]);
                    $.toaster("Apply for spare parts from the shipping management company", 'VMC');
                    $scope.managerMarker = setManager('Manager Company', new AMap.LngLat(loc.longitude, loc.latitude));
                }

            }
        )
    })