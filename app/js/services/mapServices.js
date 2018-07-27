'use strict';
App.factory('MapFactory', function ($http) {
    // noinspection JSAnnotator
    return {
        setTraffic: function (pathSimplifierIns, searchTimeData, searchSpeedData,esTime,index) {
            const Min = 0;
            const Max = 100;
            var rand = Min + Math.round(Math.random() * (Max - Min));
            if (rand <= 50) {
                pathSimplifierIns.getRenderOptions().pathLineStyle.strokeStyle = 'green';
            }
            else if (rand <=51) {
                esTime += searchTimeData[index] * 0.5;
                searchTimeData[index] *= 1.5;
                searchSpeedData[index] /= 1.5;
                console.log("缓行：", searchSpeedData[index]);
                pathSimplifierIns.getRenderOptions().pathLineStyle.strokeStyle = 'yellow';
                $.toaster('前方出现缓行情况', 'Wagon', 'warning');

            } else {
                esTime += searchTimeData[index] * 1;
                searchTimeData[index] *= 2;
                searchSpeedData[index] /= 2;
                console.log("拥堵：", searchSpeedData[index]);
                pathSimplifierIns.getRenderOptions().pathLineStyle.strokeStyle = 'red';
                $.toaster('前方出现拥堵情况', 'Wagon', 'danger');
            }
            return esTime;
        },
        newGuid: function () {
            var guid = "";
            for (var i = 1; i <= 32; i++) {
                var n = Math.floor(Math.random() * 16.0).toString(16);
                guid += n;
                if ((i === 8) || (i === 12) || (i === 16) || (i === 20))
                    guid += "-";
            }
            return guid;
        }, setManager: function (title, position) {
            return new AMap.Marker({
                map: map,
                icon: new AMap.Icon({
                        image: "images/manager32.png",
                        size: new AMap.Size(64, 64)
                    }),
                position: position,
                title: title
            });
        }, setSupplier: function (title, position) {
            return new AMap.Marker({
                map: map,
                icon: new AMap.Icon({
                    image: "images/supplier32.png",
                    size: new AMap.Size(64, 64)
                }),
                position: position,
                title: title
            });
        }
    }
});
var pathSimplifierIns;  //导航实例
var pathSimplifierIns4Route;
var map;  //地图实例
var port32;  //使用中的港口，icon类
var uselessPort32;   //未使用中的港口，icon类
var vids = {};
var port = [];
var target;// 目标港口是第一个
var gpTimer;
var manager;
var supplier;
var navg1Posion;
App.service('MapService', function (MapFactory, $http, Session, VesselProcessService, $interval) {

        // vids['413362260'] = data_1;// 船号-->位置信息
        // port['413362260'] = port_1.slice(0);// 船号-->港口列表
        // target = port_1[0];// 目标港口是第一个

        this.initMap = function () {
            /*
               加载Map
            */
            map = new AMap.Map("mapContainer", {
                //是否监控地图容器尺寸变化，默认值为false
                resizeEnable: true,
                //地图显示的缩放级别
                zoom: 5,
                center: ["114.52105", "30.6827"],
                //地图是否可通过键盘控制,默认为true
                keywordEnable: true
            });
            /*
            加载图标
             */
            port32 = new AMap.Icon({
                image: "images/port32.png",
                size: new AMap.Size(32, 32)
            });
            uselessPort32 = new AMap.Icon({
                image: "images/useless-port32.png",
                size: new AMap.Size(32, 32)
            });
            /*
            加载搜索
             */
            AMap.plugin(['AMap.Autocompvare', 'AMap.PlaceSearch'], function () {
                var autoOptions_start = {
                    //城市，默认全国
                    city: "",
                    //可选参数，用来指定一个input输入框，设定之后，在input输入文字将自动生成下拉选择列表
                    input: "startPointSearch"
                };
                var autocompvare_start = new AMap.Autocompvare(autoOptions_start);
                var placeSearch_start = new AMap.PlaceSearch({
                    //兴趣点城市,默认全国
                    city: '',
                    //当指定此参数后，搜索结果的标注、线路等均会自动添加到此地图上。可选值
                    map: '',
                    //用于控制在搜索结束后，是否自动调整地图视野使绘制的Marker点都处于视口的可见范围
                    autoFitView: false,

                });
                AMap.event.addListener(autocompvare_start, "select", function (e) {
                    //adcode区域编码
                    placeSearch_start.setCity(e.poi.adcode);
                    placeSearch_start.search(e.poi.name, function (status, result) {
                        if (manager !== undefined) {
                            manager.hide();
                        }
                        manager = MapFactory.setManager(result.poiList.pois[0].name, result.poiList.pois[0].location);

                    });
                });


                var autoOptions_end = {
                    city: "",
                    input: "endPointSearch"
                };
                var autocompvare_end = new AMap.Autocompvare(autoOptions_end);
                var placeSearch_end = new AMap.PlaceSearch({
                    city: '',
                    map: '',
                    autoFitView: false,
                });
                AMap.event.addListener(autocompvare_end, "select", function (e) {
                    placeSearch_end.setCity(e.poi.adcode);
                    placeSearch_end.search(e.poi.name, function (status, result) {
                        if (supplier !== undefined) {
                            supplier.hide();
                        }
                        supplier = MapFactory.setSupplier(result.poiList.pois[0].name, result.poiList.pois[0].location);
                        var supplierData = {
                            slname: e.poi.name,
                            x_coor:result.poiList.pois[0].location.getLng(),
                            y_coor:result.poiList.pois[0].location.getLat()
                        };
                        console.log("result:",result.poiList.pois[0].location.getLat());
                        $http.post(activityBasepath + '/supplier/location/', supplierData)
                            .success(function (data) {
                                console.log("supplier location:", data);
                            })
                    });
                });
            });
            /*
                加载路径展示
            */
            AMapUI.load(['ui/misc/PathSimplifier', 'lib/$'], function (PathSimplifier, $) {

                if (!PathSimplifier.supportCanvas) {
                    alert('当前环境不支持 Canvas！');
                    return;
                }
                pathSimplifierIns4Route = new PathSimplifier({
                    //置顶选中的轨迹线；置顶的含义是，将该轨迹线的zIndex设置为现存最大值+1。默认true。
                    onTopWhenSelected: false,
                    autoSetFitView: false,
                    //所属的地图实例
                    map: map,
                    getPath: function (pathData, pathIndex) {
                        //返回轨迹数据中的节点坐标信息，[AMap.LngLat, AMap.LngLat...] 或者 [[lng|number,lat|number],...]
                        return pathData.path;
                    },
                    getHoverTitle: function (pathData, pathIndex, pointIndex) {
                        //返回鼠标悬停时显示的信息
                        if (pointIndex >= 0) {
                            //鼠标悬停在某个轨迹节点上
                            return pathData.name + '，点：' + pointIndex + '/' + pathData.path.length;
                        }
                        //鼠标悬停在节点之间的连线上
                        return pathData.name + '，点数量' + pathData.path.length;
                    },
                    renderOptions: {
                        //绘制路线节点，如不需要可设置为-1
                        renderAllPointsIfNumberBelow: -1,
                        onTopWhenSelected: true,
                        pathLineStyle: {
                            strokeStyle: 'blue',
                            lineWidth: 4,
                            dirArrowStyle: true
                        }
                    }
                });
                pathSimplifierIns = new PathSimplifier({
                    //置顶选中的轨迹线；置顶的含义是，将该轨迹线的zIndex设置为现存最大值+1。默认true。
                    onTopWhenSelected: true,
                    autoSetFitView: false,
                    //所属的地图实例
                    map: map,
                    getPath: function (pathData, pathIndex) {
                        //返回轨迹数据中的节点坐标信息，[AMap.LngLat, AMap.LngLat...] 或者 [[lng|number,lat|number],...]
                        return pathData.path;
                    },
                    getHoverTitle: function (pathData, pathIndex, pointIndex) {
                        //返回鼠标悬停时显示的信息
                        if (pointIndex >= 0) {
                            //鼠标悬停在某个轨迹节点上
                            return pathData.name + '，点：' + pointIndex + '/' + pathData.path.length;
                        }
                        //鼠标悬停在节点之间的连线上
                        return pathData.name + '，点数量' + pathData.path.length;
                    },
                    renderOptions: {
                        //绘制路线节点，如不需要可设置为-1
                        renderAllPointsIfNumberBelow: -1,
                        onTopWhenSelected: true,
                        autoSetFitView: true,
                        pathLineStyle: {
                            strokeStyle: 'white',
                            lineWidth: 6,
                            dirArrowStyle: true
                        },
                        pathNavigatorStyle: {
                            //巡航器形状宽度
                            width: 64,
                            //巡航器形状高度
                            height: 64,
                            autoRotate: false,
                            // content: 'defaultPathNavigator'
                            content: PathSimplifier.Render.Canvas.getImageContent('images/wagon64.png', function onload() {
                                //图片加载成功，重新绘制一次
                                pathSimplifierIns.renderLater();
                            }, function onerror(e) {
                                alert('图片加载失败！');
                            })
                        }
                    }
                });
                window.pathSimplifierIns = pathSimplifierIns;
            });
            /*
            加载toaster
             */
            $.toaster({
                settings: {
                    toaster: {
                        css: {
                            top: '10%',
                            right: '5%'
                        }
                    },
                    toast: {
                        fade: {in: 'fast', out: 'slow'},

                        display: function ($toast) {
                            return $toast.fadeIn(settings.toast.fade.in);
                        },

                        remove: function ($toast, callback) {
                            return $toast.animate(
                                {
                                    opacity: '0',
                                    height: '0px'
                                },
                                {
                                    duration: settings.toast.fade.out,
                                    compvare: callback
                                });
                        }
                    },
                    timeout: 10000
                }
            });
        };
        this.doNavigation = function (event, ZoomInVal) {
            $.toaster('车辆导航开始!,目的地：' + event.data.vDestPort.pname, 'Wagon', 'success');
            pathSimplifierIns.clearPathNavigators();
            pathSimplifierIns.setData();
            pathSimplifierIns4Route.clearPathNavigators();
            pathSimplifierIns4Route.setData();

            var eEnd = Date.parse(event.data.vDestPort.EEnd);
            var esTime = Date.parse(event.data.wDestPort.esTime);
            //获取路径
            if (gpTimer !== null) {
                $interval.cancel(gpTimer);
            }
            var route = event.data.pathResult;
            var path = route.paths[0];
            var tempPathData = [];
            var pathData = [];
            var searchPathData = [];
            var searchDistanceData = [];
            var searchTimeData = [];
            var searchSpeedData = [];
            for (var i = 0; i < path.steps.length; i++) {
                tempPathData.push(path.steps[i].polyline);
                searchDistanceData.push(path.steps[i].distance);
                searchTimeData.push(path.steps[i].duration);
                searchSpeedData.push(path.steps[i].distance / path.steps[i].duration * 3.6 * ZoomInVal);
            }
            //extract poly line
            for (var i = 0; i < tempPathData.length; i++) {
                var tempString = tempPathData[i].split(';');
                searchPathData[i] = [];
                for (var j = 0; j < tempString.length; j++) {
                    var temp = tempString[j].split(',');
                    searchPathData[i].push(new AMap.LngLat(temp[0], temp[1]));
                    pathData.push(new AMap.LngLat(temp[0], temp[1]));
                }
            }
            //启动Navigation
            var index = 0;
            // var totalTime = 0;
            var NavigationEvent = event;
            var expandPathFlag = true;
            var NavigationData = {}; //
            pathSimplifierIns4Route.setData([{
                name: '总路线',
                path: pathData.slice(0)
            }]);
            NavigationData = [{
                name: '路段',
                path: searchPathData[index].slice(0)
            }];
            pathSimplifierIns.setData(NavigationData);
            //对第一条线路（即索引 0）创建一个巡航器
            var navg1 = pathSimplifierIns.createPathNavigator(0, {
                //循环播放
                loop: false,
            });
            esTime=MapFactory.setTraffic(pathSimplifierIns, searchTimeData, searchSpeedData, esTime, index);
            if (esTime > eEnd) {
                if (gpTimer !== null) {
                    $interval.cancel(gpTimer);
                }
                // navg1.stop();
                pathSimplifierIns.clearPathNavigators();
                pathSimplifierIns4Route.clearPathNavigators();
                $.toaster('时间不充足,需要重新规划路径!', 'Wagon', 'warning');
                var data2VWC = {
                    'msgType': "msg_UpdateDest",
                    'V_pid': event.data.V_pid,
                    'W_pid': event.data.W_Info.value.pid
                };
                $http.post(activityBasepath + "/coord/messages/Msg_StartVWC", data2VWC)
                    .success(function (data) {
                        console.log("执行重新规划");
                    });
                return false;
            }
            navg1.setSpeed(searchSpeedData[index]);
            // totalTime += searchTimeData[index];
            //flag是是否做路程扩展的判断标志
            var expandPath = function () {


                if (navg1.getNaviStatus().toString() === 'pause' && navg1.isCursorAtPathEnd()) {
                    if (index + 1 > searchPathData.length - 1) {
                        $interval.cancel(gpTimer);
                        $.toaster("车已到达指定地点！"+event.data.wDestPort.pname, 'Wagon', 'success');
                        var isArriving = {
                            name : "isArriving",
                            type: 'boolean',
                            value: true,
                            scope: 'local'
                        };

                        $http.put(activityBasepath + '/zbq/variables/' + NavigationEvent.data.W_Info.value.pid + "/isArriving/compvare", isArriving)
                            .success(function (data) {
                                console.log("车已到达指定地点",data);
                                console.log("目标地点:",event.data.wDestPort.pname);
                                $http.post(activityBasepath + '/zbq/tasks/Running')
                                    .success(function(data){
                                        console.log("Running 结束！");
                                    })
                            });

                        expandPathFlag = false;
                    }
                    if (index + 1 <= searchPathData.length - 1 && esTime <= eEnd) {
                        expandPathFlag = doExpand();
                    }
                }
                if (expandPathFlag) {
                    setTimeout(expandPath, 200);
                }
            };
            var getPosition = function () {
                var position = navg1.getPosition();
                navg1Posion=position;
                // console.log("navi1Posion:",navg1Posion.getLng(),navg1Posion.getLat());
                $http.get(activityBasepath + '/zbq/variables/' + NavigationEvent.data.W_Info.value.pid + "/W_Info")
                    .success(function (data) {
                        data.value.x_Coor = position.getLng();
                        data.value.y_Coor = position.getLat();
                        $http.put(activityBasepath + '/zbq/variables/' + NavigationEvent.data.W_Info.value.pid + "/W_Info", data)
                            .success(function (data) {
                            });
                    });
            };
            navg1.start();
            gpTimer = $interval(function () {
                getPosition();
            }, 500);
            expandPath();
        };

    }
);
