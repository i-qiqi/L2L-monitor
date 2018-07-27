var  map;
var port32 = new AMap.Icon({
    image: "images/port32.png",
    size: new AMap.Size(32, 32)
});;  //使用中的港口，icon类
var uselessPort32 = new AMap.Icon({
    image: "images/useless-port32.png",
    size: new AMap.Size(32, 32)
});;   //未使用中的港口，icon类
var mapCenter =  ["114.52105", "30.6827"];
var mapZoom = 5;
function initMap() {

    //TODO: 加载Map
    map = new AMap.Map("mapContainer", {
        //是否监控地图容器尺寸变化，默认值为false
        resizeEnable: true,
        //地图显示的缩放级别
        zoom: mapZoom,
        center: mapCenter,
        //地图是否可通过键盘控制,默认为true
        keywordEnable: true
    });


    //TODO:加载搜索
    AMap.plugin(['AMap.Autocomplete', 'AMap.PlaceSearch'], function () {
        var autoOptions_start = {
            //城市，默认全国
            city: "",
            //可选参数，用来指定一个input输入框，设定之后，在input输入文字将自动生成下拉选择列表
            input: "startPointSearch"
        };
        var autocomplete_start = new AMap.Autocomplete(autoOptions_start);
        var placeSearch_start = new AMap.PlaceSearch({
            //兴趣点城市,默认全国
            city: '',
            //当指定此参数后，搜索结果的标注、线路等均会自动添加到此地图上。可选值
            map: '',
            //用于控制在搜索结束后，是否自动调整地图视野使绘制的Marker点都处于视口的可见范围
            autoFitView: false,

        });
        AMap.event.addListener(autocomplete_start, "select", function (e) {
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
        var autocomplete_end = new AMap.Autocomplete(autoOptions_end);
        var placeSearch_end = new AMap.PlaceSearch({
            city: '',
            map: '',
            autoFitView: false,
        });
        AMap.event.addListener(autocomplete_end, "select", function (e) {
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
                            complete: callback
                        });
                }
            },
            timeout: 15000
        }
    });
};

function setManager(title, position) {
    return new AMap.Marker({
        map: map,
        icon: new AMap.Icon({
            image: "images/manager32.png",
            size: new AMap.Size(64, 64)
        }),
        position: position,
        title: title
    });
}
function setSupplier(title, position) {
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
/**
 * load PathSimplifier
 */
function loadWagonSimulator(wagonManager, idx) {
    //加载PathSimplifier，loadUI的路径参数为模块名中 'ui/' 之后的部分
    // var pathSimplifierIns = {};
    wagonManager.pathSimplifierIns = createPathSimplifierIns();
    wagonManager.pathSimplifierIns.setData(wagonManager.pathDatas);
    wagonManager.navigator = createNavigator(wagonManager.pathSimplifierIns, idx , wagonManager.speed);
}


/**
 * map function
 */

function createPathSimplifierIns(PathSimplifier) {
    return new PathSimplifier({
        zIndex: 100,
        autoSetFitView: false,
        map: map, //所属的地图实例
        getPath: function (pathData, pathIndex) {
            //返回轨迹数据中的节点坐标信息，[AMap.LngLat, AMap.LngLat...] 或者 [[lng|number,lat|number],...]
            return pathData.path;
        },
        getHoverTitle: function (pathData, pathIndex, pointIndex) {
            //返回鼠标悬停时显示的信息
            if (pointIndex >= 0) {
                //鼠标悬停在某个轨迹节点上
                return pathData.name + '，点:' + pointIndex + '/' + pathData.path.length;
            }
            //鼠标悬停在节点之间的连线上
            return pathData.name + '，点数量' + pathData.path.length;
        },
        renderOptions: {
            //轨迹线的样式
            pathLineStyle: {
                strokeStyle: '#4acc11',
                lineWidth: 6,
                dirArrowStyle: true
            }
        }
    });
}

function createNavigator(PathSimplifier, pathSimplifierIns, idx , speed) {
    return pathSimplifierIns.createPathNavigator(idx, //关联第1条轨迹
        {
            loop: false, //循环播放
            speed: speed,
            pathNavigatorStyle: {
                autoRotate: true, //禁止调整方向
                width: 25,
                height: 30,
                // initRotateDegree: 90,
                content: PathSimplifier.Render.Canvas.getImageContent(mapBaseUrl+'imgs/car.png', onload, onerror),
                //经过路径的样式
                pathLinePassedStyle: {
                    lineWidth: 6,
                    strokeStyle: 'black',
                    dirArrowStyle: {
                        stepSpace: 15,
                        strokeStyle: 'red'
                    }
                }
            }
        });
}


/**
 * set traffic
 * @param pathSimplifierIns
 * @param searchTimeData
 * @param searchSpeedData
 * @param esTime
 * @param index
 * @returns {*}
 */
function setTraffic(wagon) {
    const Min = 0;
    const Max = 100;
    var idx = wagon.idx;
    var rand = Min + Math.round(Math.random() * (Max - Min));
    if (rand <= 50) {
        wagon.stepSimplifierIns.getRenderOptions().pathLineStyle.strokeStyle = 'green';
    }else{
        wagon.timeout+= wagon.path.steps[idx].duration * 1;
        wagon.path.steps[idx].duration *= 2;
        wagon.stepSimplifierIns.getRenderOptions().pathLineStyle.strokeStyle = 'red';
        $.toaster('Slow down due to the traffic jam', 'IoT-Wagon', 'danger');
    }
}


function doExpand(wagon) {
    if(wagon.navigator.getNaviStatus().toString() == 'pause' && wagon.navigator.isCursorAtPathEnd()) {
        wagon.idx++;
        if (wagon.idx == wagon.path.steps.length) {
            return  'ARRIVAL';
        }else if(wagon.idx <  wagon.path.steps.length){
            if(wagon.idx % 10 == 0){
                console.log("set traffic" + wagon.idx);
                setTraffic(wagon);
                if(wagon.timeout >= wagon.trafficThreshold){
                    return "TRAFFIC";
                }
            }
            return "NEXT_STEP";
        }else{
            console.log("已结束行驶，路径扩张定时器没关闭");
        }
    }

    return 'DEFAULT';
}


